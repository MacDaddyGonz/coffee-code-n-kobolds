#!/usr/bin/env node
// Drives Milestone 2's board API against the REAL dev deployment.
//
// This exists because convex-test does not apply Convex's own value validation.
// Milestone 1 shipped a bug of exactly that shape: a truncated display name left
// a lone UTF-16 surrogate, which convex-test stored happily and a real deployment
// rejected. Everything here is therefore a genuine round trip — a real upload URL,
// a real POST of real bytes, real float64s through the position table — so a value
// the cloud refuses fails here rather than in front of the group on a Friday night.
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

    // 6. And the start gate, which is what flips every client to the board.
    await client.mutation('games:start', { code, dmCode })
    const started = await client.query('games:getByCode', { code })
    check('games:start moved the game to playing', started && started.status === 'playing')
    await client.mutation('games:returnToLobby', { code, dmCode })
  } catch (error) {
    const data = error && error.data ? ` ${JSON.stringify(error.data)}` : ''
    record('the run completed without an unexpected error', false, `${error.message ?? error}${data}`)
  } finally {
    // Best effort. There is no API for deleting a game — that is Milestone 7's
    // admin view — so the scene, its blob and the tokens are what can go.
    try {
      for (const tokenId of created) {
        await client.mutation('board:removeToken', { code, dmCode, tokenId })
      }
      if (sceneId) await client.mutation('scenes:remove', { code, dmCode, sceneId })
      console.log(`\n  cleaned up the scene and ${created.length} tokens`)
      console.log(`  the game itself remains: ${code} (no delete API before Milestone 7)`)
    } catch (error) {
      console.log(`\n  cleanup did not finish: ${error.message ?? error}`)
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
