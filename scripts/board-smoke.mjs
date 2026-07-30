#!/usr/bin/env node
// Drives Milestone 2's board API and Milestone 3's character sheets against the
// REAL dev deployment.
//
// This exists because convex-test does not apply Convex's own value validation.
// Milestone 1 shipped a bug of exactly that shape: a truncated display name left
// a lone UTF-16 surrogate, which convex-test stored happily and a real deployment
// rejected. Everything here is therefore a genuine round trip — a real upload URL,
// a real POST of real bytes, real float64s through the position table — so a value
// the cloud refuses fails here rather than in front of the group on a Friday night.
//
// Milestone 3 gives a deployment far more to have an opinion about than Milestone 2
// did: a nested discriminated union in an optional field, arrays of objects at their
// forty-entry cap, emoji in prose a player typed, an optional field written as
// `undefined`, and NaN arriving where a whole number was expected. Every one of those
// is a value convex-test stores without comment.
//
//   node scripts/board-smoke.mjs
//
// Plain .mjs on purpose: no tsx, no new dependency, nothing to install.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ConvexHttpClient } from 'convex/browser'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** The calibration of `Admittance [Gridded 16x12]`, with a deliberate offset. */
const MAP_WIDTH = 2240
const MAP_HEIGHT = 1680
const GRID = { gridSize: 140, gridOffsetX: 37.5, gridOffsetY: -12.25 }

/**
 * A 1×1 transparent PNG. Nothing server-side decodes it — `scenes.create` reads
 * only the stored size — but posting real image bytes to the real upload endpoint
 * is the point of this script, so it is a real PNG rather than random noise.
 */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='

/**
 * Six catalogue entries, copied out of `convex/lib/rules.ts` word for word.
 *
 * Restated rather than imported for the reason `snapToGrid` below is restated: this
 * is plain .mjs on purpose, so it cannot import a .ts module, and a script that
 * derived its fixtures from the code under test would agree with a mangled
 * catalogue as readily as with a correct one. Copied text also means the round trip
 * below is over the real thing — em dashes, apostrophes and all — rather than over
 * `'x'.repeat(200)`.
 */
const CATALOGUE = {
  fireBolt: {
    key: 'fire-bolt',
    name: 'Fire Bolt',
    text: 'A mote of fire hurled at one target within 120 feet. Make a ranged spell attack; on a hit it burns, and it sets light to anything flammable nobody is holding or wearing.',
    roll: '1d10',
    level: 0,
  },
  cureWounds: {
    key: 'cure-wounds',
    name: 'Cure Wounds',
    text: 'Touch a creature and restore hit points to it. Roll another 2d8 for each spell slot level above 1st.',
    roll: '2d8+WIS',
    level: 1,
  },
  fireball: {
    key: 'fireball',
    name: 'Fireball',
    text: 'A roaring sphere of flame fills a 20-foot radius around a point within 150 feet, going round corners to do it. Each creature there takes the damage, halved on a successful Dexterity saving throw. Another 1d6 per slot level above 3rd.',
    roll: '8d6',
    level: 3,
  },
  secondWind: {
    key: 'second-wind',
    name: 'Second Wind',
    text: 'A bonus action, once per rest, to catch your breath and regain hit points. Add your fighter level to the die.',
    roll: '1d10',
    level: null,
  },
  actionSurge: {
    key: 'action-surge',
    name: 'Action Surge',
    text: 'Once per rest, take one extra action on your turn — a whole second action, not a bonus action.',
    roll: null,
    level: null,
  },
  greatclub: {
    key: 'npc-greatclub',
    name: 'Greatclub',
    text: 'Melee attack, +6 to hit, reach 5 feet, bludgeoning damage — an ogre with a tree trunk, and enough to fell a first-level character outright.',
    roll: '2d8+3',
    level: null,
  },
  multiattack: {
    key: 'npc-multiattack',
    name: 'Multiattack',
    text: 'The creature takes two of its attacks on its turn instead of one. Roll each of them separately from its other entries.',
    roll: null,
    level: null,
  },
}

/** A catalogue entry copied onto a sheet, which is what the picker does: a copy, never a pointer. */
function entryFrom(catalogue, id) {
  return {
    id,
    name: catalogue.name,
    text: catalogue.text,
    roll: catalogue.roll,
    level: catalogue.level,
    catalogueKey: catalogue.key,
  }
}

/** A hand-typed entry, filled in by the caller. Everything the picker does not supply. */
function customEntry(fields) {
  return { roll: null, level: null, catalogueKey: null, ...fields }
}

/**
 * The sheet the round trip is asserted against.
 *
 * Deliberately awkward in the places a wire format is: an emoji and four scripts
 * worth of non-ASCII in one entry, a cantrip whose level is the number zero rather
 * than null, and mixed save proficiencies so a run of six booleans cannot come back
 * collapsed into one. Already normalised — no stray whitespace, rolls in the casing
 * `normaliseRoll` produces — so anything the deployment changes is a real change
 * rather than the server tidying up after us.
 */
const PC_NAME = 'Sköll Emberkin 🎲'
const PC_SHEET = {
  kind: 'pc',
  level: 9,
  className: 'Battle Skald',
  abilities: { str: 17, dex: 12, con: 15, int: 8, wis: 13, cha: 20 },
  saveProficiencies: { str: true, dex: false, con: true, int: false, wis: false, cha: true },
  armourClass: 18,
  maxHp: 84,
  hitDice: { count: 7, faces: 10 },
  feats: [
    entryFrom(CATALOGUE.secondWind, 'feat-second-wind'),
    entryFrom(CATALOGUE.actionSurge, 'feat-action-surge'),
    customEntry({
      id: 'feat-aether-bolt',
      name: 'Æther Bolt 🜁🔥',
      text: 'Éclair d’æther — 2d8 de dégâts radiants, et la cible brille. ✨ 火 🐉',
      roll: '2d8+CHA',
    }),
  ],
  spells: [
    entryFrom(CATALOGUE.fireBolt, 'spell-fire-bolt'),
    entryFrom(CATALOGUE.cureWounds, 'spell-cure-wounds'),
    entryFrom(CATALOGUE.fireball, 'spell-fireball'),
  ],
}

/**
 * The NPC the acceptance test is about. 271 and 137 are chosen to be searchable:
 * a scan of a player's payload for `45` would match half the ids in it, so the
 * numbers have to be ones a coincidence is unlikely to produce.
 *
 * A negative initiative bonus and an NPC whose vitals row therefore stores
 * `hitDiceRemaining: undefined` are both here on purpose — see the checks below.
 */
const NPC_NAME = 'Grendel of the Ford 🐉'
const NPC_MAX_HP = 271
const NPC_CURRENT_HP = 137
const NPC_SHEET = {
  kind: 'npc',
  armourClass: 17,
  maxHp: NPC_MAX_HP,
  initiativeBonus: -2,
  actions: [
    entryFrom(CATALOGUE.greatclub, 'npc-greatclub'),
    entryFrom(CATALOGUE.multiattack, 'npc-multiattack'),
  ],
  notes: 'Waits under the third arch. Surfaces on a failed Perception check. 🐉',
}

const results = []
let failures = 0

function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  if (!ok) failures += 1
  const mark = ok ? 'PASS' : 'FAIL'
  console.log(`  ${mark}  ${name}${detail ? ` — ${detail}` : ''}`)
}

function check(name, condition, detail = '') {
  record(name, Boolean(condition), detail)
  return Boolean(condition)
}

/**
 * A check whose assertion is the refusal.
 *
 * Awaiting a call that must not succeed is the only way to test a bound the
 * *deployment* applies. A bound this script checked on the way in would be this
 * script's bound, which is precisely the mistake CLAUDE.md invariant 6 is about.
 */
async function refuses(name, fn) {
  try {
    await fn()
  } catch (error) {
    return check(name, true, describeError(error))
  }
  return check(name, false, 'the deployment accepted it')
}

/** A ConvexError's own message where there is one, trimmed to fit a line of output. */
function describeError(error) {
  const data = error && error.data
  const raw =
    data && typeof data === 'object' && typeof data.message === 'string'
      ? data.message
      : String((error && error.message) ?? error)
  // One check, one line: a raw deployment error arrives with its request id on a
  // line of its own, and a result list that reflows is a result list nobody reads.
  const message = raw.trim().replace(/\s+/g, ' ')
  // Cut by code point rather than by code unit. Slicing a string mid-surrogate is
  // the bug this whole script exists for, and doing it in the failure reporter
  // would be a poor way to find that out.
  const points = [...message]
  return points.length > 110 ? `${points.slice(0, 109).join('')}…` : message
}

/**
 * Where two values first differ, or null.
 *
 * A round trip that comes back subtly wrong — a null turned into an absent field,
 * a nested union re-tagged, an emoji re-encoded — is exactly what this script is
 * for, so a failure has to name the field rather than print two sheets side by side.
 */
function firstDifference(a, b, path = 'sheet') {
  if (a === b) return null
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return `${path}: stored ${JSON.stringify(b)}, wanted ${JSON.stringify(a)}`
  }
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: array/object mismatch`

  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const child = Array.isArray(a) ? `${path}[${key}]` : `${path}.${key}`
    if (!(key in a) || !(key in b)) return `${child}: present on one side only`
    const found = firstDifference(a[key], b[key], child)
    if (found) return found
  }
  return null
}

/**
 * Whether a number appears anywhere in a decoded payload, at any depth.
 *
 * Run alongside a substring scan of the serialised form rather than instead of it.
 * The substring scan catches a hit point that reached the client as text; this
 * catches one that reached it as a number in a field nobody thought to look at.
 */
function holdsNumber(value, wanted) {
  if (typeof value === 'number') return value === wanted
  if (Array.isArray(value)) return value.some((item) => holdsNumber(item, wanted))
  if (value && typeof value === 'object') {
    return Object.values(value).some((item) => holdsNumber(item, wanted))
  }
  return false
}

/**
 * The fields that cannot carry a hit point but can spell one by accident: a
 * document id and a thirteen-digit creation timestamp are both made of digits, so a
 * substring scan for `271` over a raw payload trips over one every hundred runs or
 * so. A smoke test that cries wolf is one the group learns to ignore, which costs
 * more than three digits of coverage — and `holdsNumber` above still looks at every
 * number in the payload including these, so nothing is actually exempted.
 */
const OPAQUE_KEYS = new Set(['_id', 'tokenId', 'characterId', 'claimedByPlayerId', 'createdAt'])

function redactOpaque(value) {
  if (Array.isArray(value)) return value.map(redactOpaque)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) =>
        OPAQUE_KEYS.has(key) ? [key, '<opaque>'] : [key, redactOpaque(item)],
      ),
    )
  }
  return value
}

/** A cleanup step that reports its own failure rather than abandoning the ones after it. */
async function quietly(fn) {
  try {
    await fn()
  } catch (error) {
    console.log(`  cleanup step did not finish: ${describeError(error)}`)
  }
}

/** Reads VITE_CONVEX_URL out of .env.local, which `convex dev` writes. */
function deploymentUrl() {
  const fromEnv = process.env.VITE_CONVEX_URL
  if (fromEnv) return fromEnv

  const path = resolve(ROOT, '.env.local')
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    throw new Error(
      `Cannot read ${path}. Run \`npm run dev:backend\` once — it writes VITE_CONVEX_URL there.`,
    )
  }
  const match = text.match(/^\s*VITE_CONVEX_URL\s*=\s*(.+?)\s*$/m)
  if (!match) throw new Error(`No VITE_CONVEX_URL in ${path}.`)
  return match[1].replace(/^["']|["']$/g, '')
}

/** The exact snap the server and the client share, restated so this script is independent of both. */
function snapToGrid(point, grid, sizeSquares) {
  const half = sizeSquares / 2
  const col = Math.round((point.x - grid.gridOffsetX) / grid.gridSize - half)
  const row = Math.round((point.y - grid.gridOffsetY) / grid.gridSize - half)
  return {
    x: grid.gridOffsetX + (col + half) * grid.gridSize,
    y: grid.gridOffsetY + (row + half) * grid.gridSize,
  }
}

async function uploadPng(client, code, dmCode) {
  const uploadUrl = await client.mutation('files:generateUploadUrl', { code, dmCode })
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: Buffer.from(PNG_BASE64, 'base64'),
  })
  if (!response.ok) {
    throw new Error(`upload POST failed: ${response.status} ${await response.text()}`)
  }
  const { storageId } = await response.json()
  if (!storageId) throw new Error('upload POST returned no storageId')
  return storageId
}

async function main() {
  const url = deploymentUrl()
  console.log(`\nBoard smoke test against ${url}\n`)
  const client = new ConvexHttpClient(url)

  const created = []
  const createdCharacters = []
  let code = null
  let dmCode = null
  let sceneId = null

  try {
    const game = await client.mutation('games:create', {
      name: `Board Smoke ${new Date().toISOString()}`,
      dmName: 'Smoke DM',
      recoveryPhrase: 'brass lantern smoke',
    })
    code = game.code
    dmCode = game.dmCode
    check('games:create issued a join code and a DM code', Boolean(code && dmCode), code)

    // 1. A real upload URL, a real POST, real bytes in real storage.
    const imageId = await uploadPng(client, code, dmCode)
    check('files:generateUploadUrl accepted a POST and returned a storageId', Boolean(imageId))

    const scene = await client.mutation('scenes:create', {
      code,
      dmCode,
      name: 'Admittance',
      imageId,
      imageWidth: MAP_WIDTH,
      imageHeight: MAP_HEIGHT,
    })
    sceneId = scene.sceneId
    check('scenes:create stored a scene', Boolean(sceneId))

    // 2. Non-integer floats through the real value validation. 37.5 and −12.25
    // are exact in binary; a deployment that mangled them would break every snap.
    await client.mutation('scenes:updateGrid', {
      code,
      dmCode,
      sceneId,
      gridSize: GRID.gridSize,
      gridOffsetX: GRID.gridOffsetX,
      gridOffsetY: GRID.gridOffsetY,
      gridVisible: true,
    })
    const active = await client.query('scenes:active', { code })
    check(
      'scenes:updateGrid round-tripped fractional offsets exactly',
      active &&
        active.gridSize === GRID.gridSize &&
        active.gridOffsetX === GRID.gridOffsetX &&
        active.gridOffsetY === GRID.gridOffsetY,
      active ? `${active.gridOffsetX} / ${active.gridOffsetY}` : 'no active scene',
    )

    // 3. One token on each layer, both with art of their own.
    const openArt = await uploadPng(client, code, dmCode)
    const secretArt = await uploadPng(client, code, dmCode)

    const open = await client.mutation('board:addToken', {
      code,
      dmCode,
      sceneId,
      name: 'Village Guard',
      layer: 'player',
      sizeSquares: 1,
      tint: '#c0392b',
      imageId: openArt,
      x: 300,
      y: 300,
    })
    created.push(open.tokenId)
    const secret = await client.mutation('board:addToken', {
      code,
      dmCode,
      sceneId,
      name: 'Ambush Skeleton',
      layer: 'dm',
      sizeSquares: 2,
      tint: '#2c3e50',
      imageId: secretArt,
      x: 900,
      y: 700,
    })
    created.push(secret.tokenId)
    check('board:addToken accepted a player-layer and a DM-layer token', created.length === 2)

    // 4. In-flight write, then the settling write. Both against the real validator.
    for (const [tokenId, sizeSquares] of [
      [open.tokenId, 1],
      [secret.tokenId, 2],
    ]) {
      const loose = { x: 1234.5, y: 777.25 }
      await client.mutation('board:moveToken', {
        code,
        dmCode,
        sceneId,
        tokenId,
        x: loose.x,
        y: loose.y,
        settle: false,
      })
      await client.mutation('board:moveToken', {
        code,
        dmCode,
        sceneId,
        tokenId,
        x: loose.x,
        y: loose.y,
        settle: true,
      })

      const positions = await client.query('board:positions', { code, sceneId, dmCode })
      const row = positions.find((entry) => entry.tokenId === tokenId)
      const want = snapToGrid(loose, GRID, sizeSquares)
      check(
        `board:moveToken settled a ${sizeSquares}×${sizeSquares} token on the grid`,
        row && row.x === want.x && row.y === want.y,
        row ? `got ${row.x},${row.y} want ${want.x},${want.y}` : 'no placement row',
      )
    }

    // 5. THE point of the milestone, against the real wire.
    const dmTokens = await client.query('board:tokens', { code, dmCode })
    const dmToken = dmTokens.find((token) => token._id === secret.tokenId)
    check('the DM can see their own DM-layer token', Boolean(dmToken))

    const playerTokens = await client.query('board:tokens', { code })
    const playerPositions = await client.query('board:positions', { code, sceneId })
    const playerScene = await client.query('scenes:active', { code })
    const payload = JSON.stringify([playerTokens, playerPositions, playerScene])

    check('a player payload does not contain the DM-layer token id', !payload.includes(secret.tokenId))
    check('a player payload does not contain the DM-layer token name', !payload.includes('Ambush Skeleton'))
    if (dmToken && typeof dmToken.artUrl === 'string') {
      check(
        'a player payload does not contain the DM-layer art URL',
        !payload.includes(dmToken.artUrl),
      )
    } else {
      record('a player payload does not contain the DM-layer art URL', false, 'no DM art URL to compare')
    }
    check(
      'a player payload does contain the player-layer token',
      payload.includes(open.tokenId),
      'positive control — the scan is not passing on an empty fixture',
    )

    // 6. Milestone 3's sheets. A nested discriminated union in an optional field,
    // through the real value validation, with real prose in it.
    const pc = await client.mutation('characters:create', {
      code,
      name: PC_NAME,
      sheet: PC_SHEET,
    })
    createdCharacters.push(pc.characterId)
    check(
      'characters:create stored a player character with a full sheet',
      Boolean(pc.characterId),
      'no DM code — any player may add a hero (ADR 0002)',
    )

    const storedPc = await client.query('characters:sheet', {
      code,
      dmCode,
      characterId: pc.characterId,
    })
    const drift = storedPc ? firstDifference(PC_SHEET, storedPc.sheet) : 'no sheet came back'
    check(
      'characters:sheet round-tripped every field, emoji and non-ASCII included',
      storedPc && storedPc.name === PC_NAME && drift === null,
      drift ?? `name ${JSON.stringify(storedPc.name)}`,
    )

    // 7. The forty-entry cap, which is the largest thing this application asks a
    // document to hold. Convex has opinions about document size and nesting depth
    // that convex-test does not, and eighty objects inside a union inside an
    // optional field is where they would first be heard.
    const filler = (prefix, index) =>
      customEntry({
        id: `${prefix}-${index}`,
        name: `${prefix} ${index}`,
        text: 'Filler, so the deployment is asked to store a list at its cap.',
        roll: index % 2 === 0 ? '1d6+2' : null,
      })
    const cappedFeats = Array.from({ length: 40 }, (_, index) => filler('feat', index))
    const cappedSpells = Array.from({ length: 40 }, (_, index) => filler('spell', index))
    const cappedSheet = { ...PC_SHEET, feats: cappedFeats, spells: cappedSpells }

    await client.mutation('characters:updateSheet', {
      code,
      dmCode,
      characterId: pc.characterId,
      sheet: cappedSheet,
    })
    const cappedBack = await client.query('characters:sheet', {
      code,
      dmCode,
      characterId: pc.characterId,
    })
    check(
      'characters:updateSheet stored forty feats and forty spells',
      cappedBack && cappedBack.sheet.feats.length === 40 && cappedBack.sheet.spells.length === 40,
      cappedBack ? `${cappedBack.sheet.feats.length} + ${cappedBack.sheet.spells.length}` : 'no sheet',
    )
    await refuses('the deployment refused a forty-first entry', () =>
      client.mutation('characters:updateSheet', {
        code,
        dmCode,
        characterId: pc.characterId,
        sheet: { ...cappedSheet, feats: [...cappedFeats, filler('feat', 40)] },
      }),
    )

    // 8. An NPC. Creating one is the operation that decides what the rest of the
    // table is not allowed to see, so it is gated on the DM code and nothing else.
    //
    // It also writes a vitals row with `hitDiceRemaining: undefined`, because a
    // monster has no hit dice — and `undefined` is not a Convex value. Whether the
    // client library drops the key or the deployment refuses the write is not
    // something convex-test can answer, which is why this check is here rather than
    // in the suite.
    const npc = await client.mutation('characters:create', {
      code,
      dmCode,
      name: NPC_NAME,
      sheet: NPC_SHEET,
    })
    createdCharacters.push(npc.characterId)
    check(
      'characters:create stored an NPC, with `hitDiceRemaining: undefined` on its vitals row',
      Boolean(npc.characterId),
    )
    await refuses('characters:create refused an NPC without the DM code', () =>
      client.mutation('characters:create', { code, name: 'Uninvited Ogre', sheet: NPC_SHEET }),
    )

    // 9. Hit points. The clamp is the server's, and the number it returns is the
    // number it stored — a client that asked for −999 has to be told about 0.
    const beaten = await client.mutation('characters:adjustHp', {
      code,
      dmCode,
      characterId: pc.characterId,
      delta: -999,
    })
    const healed = await client.mutation('characters:adjustHp', {
      code,
      dmCode,
      characterId: pc.characterId,
      delta: 999,
    })
    check(
      'characters:adjustHp clamped at zero and at the sheet maximum',
      beaten.currentHp === 0 && healed.currentHp === PC_SHEET.maxHp,
      `${beaten.currentHp} then ${healed.currentHp} of ${PC_SHEET.maxHp}`,
    )
    const typed = await client.mutation('characters:setHp', {
      code,
      dmCode,
      characterId: pc.characterId,
      currentHp: 41,
    })
    check('characters:setHp stored the number it was given', typed.currentHp === 41, `${typed.currentHp}`)

    const spent = await client.mutation('characters:adjustHitDice', {
      code,
      dmCode,
      characterId: pc.characterId,
      delta: -3,
    })
    const rested = await client.mutation('characters:adjustHitDice', {
      code,
      dmCode,
      characterId: pc.characterId,
      delta: 100,
    })
    check(
      'characters:adjustHitDice spent three and capped a long rest at the sheet complement',
      spent.hitDiceRemaining === 4 && rested.hitDiceRemaining === PC_SHEET.hitDice.count,
      `${spent.hitDiceRemaining} then ${rested.hitDiceRemaining} of ${PC_SHEET.hitDice.count}`,
    )

    // 10. THE ACCEPTANCE TEST FOR THIS MILESTONE, against the real wire.
    //
    // The NPC's coin goes on the PLAYER layer, which is the case that matters: the
    // party can see the troll, so they get a health bar for it, and the health bar
    // must not be built out of its exact hit points. A DM-layer NPC is the easy
    // case — Milestone 2's filter already hides the token.
    await client.mutation('characters:setHp', {
      code,
      dmCode,
      characterId: npc.characterId,
      currentHp: NPC_CURRENT_HP,
    })
    const npcToken = await client.mutation('board:addToken', {
      code,
      dmCode,
      sceneId,
      // Deliberately not the character's name. The coin's name is on the board for
      // everyone by design; the scan below is about `characters:list`, and giving
      // the two the same string would make it scan itself.
      name: 'Ford Guardian',
      layer: 'player',
      sizeSquares: 2,
      tint: '#7f8c8d',
      characterId: npc.characterId,
      x: 500,
      y: 500,
    })
    created.push(npcToken.tokenId)

    const playerVitals = await client.query('characters:vitals', { code })
    const npcVitals = playerVitals.find((row) => row.characterId === npc.characterId)
    check(
      'a player sees the NPC as a band, with no hit-point key on the row at all',
      npcVitals &&
        npcVitals.kind === 'band' &&
        !('current' in npcVitals) &&
        !('max' in npcVitals),
      npcVitals ? `keys: ${Object.keys(npcVitals).sort().join(', ')}` : 'no row for the NPC',
    )

    const playerList = await client.query('characters:list', { code })
    const playerNpcSheet = await client.query('characters:sheet', {
      code,
      characterId: npc.characterId,
    })
    // Scanned twice over. `holdsNumber` walks every number in the decoded payload,
    // which is exact; the substring scan over the serialised form catches a hit
    // point that arrived as text in some field nobody thought to look at, and runs
    // over the redacted copy for the reason given on OPAQUE_KEYS.
    const scannable = [playerVitals, playerList, playerNpcSheet]
    const serialised = JSON.stringify(redactOpaque(scannable))
    check(
      "the NPC's exact hit points appear nowhere in a player's payload",
      !serialised.includes(String(NPC_MAX_HP)) &&
        !serialised.includes(String(NPC_CURRENT_HP)) &&
        !holdsNumber(scannable, NPC_MAX_HP) &&
        !holdsNumber(scannable, NPC_CURRENT_HP),
      `${NPC_CURRENT_HP}/${NPC_MAX_HP} scanned as text and as numbers; its sheet came back ${JSON.stringify(playerNpcSheet)}`,
    )

    const dmVitals = await client.query('characters:vitals', { code, dmCode })
    const dmNpcVitals = dmVitals.find((row) => row.characterId === npc.characterId)
    check(
      'the same fetch with the DM code does carry them',
      dmNpcVitals &&
        dmNpcVitals.kind === 'exact' &&
        dmNpcVitals.current === NPC_CURRENT_HP &&
        dmNpcVitals.max === NPC_MAX_HP,
      'positive control — without it the scan above passes on an empty fixture',
    )
    check(
      'characters:list without the DM code names the hero and not the NPC',
      !JSON.stringify(playerList).includes(NPC_NAME) &&
        playerList.some((row) => row.name === PC_NAME),
      `${playerList.length} rows, positive control included`,
    )

    // 11. And the count, which is the leak that is easy to miss: a band for every
    // prepared monster tells a player how many are waiting even when it tells them
    // nothing else.
    const hidden = await client.mutation('characters:create', {
      code,
      dmCode,
      name: 'Wyrmling in the Rafters',
      sheet: { ...NPC_SHEET, maxHp: 33, actions: [] },
    })
    createdCharacters.push(hidden.characterId)
    const vitalsAfterHidden = await client.query('characters:vitals', { code })
    const dmVitalsAfterHidden = await client.query('characters:vitals', { code, dmCode })
    check(
      'an NPC with no token on the board produces no row for a player at all',
      !vitalsAfterHidden.some((row) => row.characterId === hidden.characterId) &&
        dmVitalsAfterHidden.some((row) => row.characterId === hidden.characterId),
      `player ${vitalsAfterHidden.length} rows, DM ${dmVitalsAfterHidden.length} — positive control included`,
    )

    // 12. Values the local suite cannot judge, because convex-test does not apply
    // Convex's own value validation and this script is the only place that does.
    await refuses('characters:adjustHp refused NaN', () =>
      client.mutation('characters:adjustHp', {
        code,
        dmCode,
        characterId: pc.characterId,
        delta: Number.NaN,
      }),
    )
    await refuses('characters:adjustHp refused Infinity', () =>
      client.mutation('characters:adjustHp', {
        code,
        dmCode,
        characterId: pc.characterId,
        delta: Number.POSITIVE_INFINITY,
      }),
    )
    // A fraction is rounded rather than refused, which is `clampHp`'s stated
    // position and `snapToGrid`'s: a non-integer delta arrives from a client bug
    // rather than from anything anybody typed, and this application repairs a value
    // it can repair. What must never happen is a fraction reaching the database, so
    // that is what is asserted — 41 + 2.5 settles on a whole number.
    const fractional = await client.mutation('characters:adjustHp', {
      code,
      dmCode,
      characterId: pc.characterId,
      delta: 2.5,
    })
    check(
      'characters:adjustHp rounded a fractional delta instead of storing one',
      Number.isInteger(fractional.currentHp) && fractional.currentHp === 44,
      `41 + 2.5 stored ${fractional.currentHp}`,
    )

    await refuses('characters:updateSheet refused a NaN ability score', () =>
      client.mutation('characters:updateSheet', {
        code,
        dmCode,
        characterId: pc.characterId,
        sheet: { ...cappedSheet, abilities: { ...PC_SHEET.abilities, str: Number.NaN } },
      }),
    )
    // THE MILESTONE 1 BUG, restated for sheets. A lone high surrogate is a perfectly
    // ordinary one-character string to every bound in lib/sheet.ts, so nothing in
    // the application refuses it and nothing in the suite notices; only a real
    // deployment insists a stored string be valid Unicode.
    await refuses('characters:updateSheet refused a lone UTF-16 surrogate as an entry name', () =>
      client.mutation('characters:updateSheet', {
        code,
        dmCode,
        characterId: pc.characterId,
        sheet: {
          ...cappedSheet,
          feats: [customEntry({ id: 'feat-surrogate', name: '\uD800', text: 'Half an emoji.' })],
        },
      }),
    )
    await refuses('characters:updateSheet refused a 601-character description', () =>
      client.mutation('characters:updateSheet', {
        code,
        dmCode,
        characterId: pc.characterId,
        sheet: {
          ...cappedSheet,
          feats: [customEntry({ id: 'feat-long', name: 'Windy', text: 'x'.repeat(601) })],
        },
      }),
    )
    const survivor = await client.query('characters:sheet', {
      code,
      dmCode,
      characterId: pc.characterId,
    })
    check(
      'every refused sheet left the stored one exactly as it was',
      survivor && survivor.sheet.feats.length === 40 && survivor.sheet.abilities.str === 17,
      survivor ? `${survivor.sheet.feats.length} feats, str ${survivor.sheet.abilities.str}` : 'no sheet',
    )

    // 13. And the start gate, which is what flips every client to the board.
    await client.mutation('games:start', { code, dmCode })
    const started = await client.query('games:getByCode', { code })
    check('games:start moved the game to playing', started && started.status === 'playing')
    await client.mutation('games:returnToLobby', { code, dmCode })
  } catch (error) {
    const data = error && error.data ? ` ${JSON.stringify(error.data)}` : ''
    record('the run completed without an unexpected error', false, `${error.message ?? error}${data}`)
  } finally {
    // Best effort, and each step is guarded on its own rather than the batch: an
    // assertion that fails halfway leaves the rest to be cleaned up, and a run that
    // abandoned two forty-entry sheets every time it failed would be a slow leak
    // into the same budget the upload limits exist to protect. There is no API for
    // deleting a game — that is Milestone 7's admin view — so the scene, its blob,
    // the tokens and the characters are what can go.
    if (code && dmCode) {
      for (const tokenId of created) {
        await quietly(() => client.mutation('board:removeToken', { code, dmCode, tokenId }))
      }
      for (const characterId of createdCharacters) {
        await quietly(() => client.mutation('characters:remove', { code, dmCode, characterId }))
      }
      if (sceneId) await quietly(() => client.mutation('scenes:remove', { code, dmCode, sceneId }))
      console.log(
        `\n  cleaned up the scene, ${created.length} tokens and ${createdCharacters.length} characters`,
      )
      console.log(`  the game itself remains: ${code} (no delete API before Milestone 7)`)
    } else {
      console.log('\n  nothing to clean up: the game was never created')
    }
  }

  const passed = results.length - failures
  console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${passed}/${results.length} checks passed\n`)
  if (failures > 0) {
    for (const result of results.filter((entry) => !entry.ok)) {
      console.log(`  failed: ${result.name}${result.detail ? ` — ${result.detail}` : ''}`)
    }
    console.log('')
  }
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(`\nFAIL — ${error.message ?? error}\n`)
  process.exit(1)
})
