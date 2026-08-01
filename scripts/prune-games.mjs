#!/usr/bin/env node
// Deletes throwaway games off the dev deployment. A maintenance tool, not a feature.
//
// `npm run test:smoke` creates a game every time it runs and, until now, could only
// clean up the scene and tokens it made — there was no delete path for a game document
// at all. The dev deployment had seventy-one games, thirty-five of them smoke litter,
// every one of them holding whatever seats, characters and blobs its run had left. The
// real thing — an admin view that deletes a game a person chose — is Milestone 12; see
// `docs/roadmap.md`. This is the broom, and `convex/admin.ts` explains why it is safe
// for it to exist ahead of the milestone that owns the feature.
//
//   node scripts/prune-games.mjs                          # dry run, "Board Smoke " games
//   node scripts/prune-games.mjs --yes                    # actually delete them
//   node scripts/prune-games.mjs --prefix "Test " --yes
//
// ⚠️ **Dry run by default, and deleting takes an explicit `--yes`.** There is
// deliberately no `--all`: a tool whose default blast radius is everything is a tool
// that eventually deletes a real game, and `--prefix ""` is at least a sentence
// somebody had to type on purpose.
//
// ⚠️ **It shells out to the Convex CLI, and that is not laziness.** `ConvexHttpClient`
// — which `board-smoke.mjs` next door uses for everything — cannot call these
// functions, because they are `internalQuery` and `internalMutation` and internal
// functions are absent from the deployment's public API by construction. That is the
// property that let them be written without first answering "who may delete a game".
// `npx convex run` reaches them by holding the deployment's admin credentials, which
// is the same authority as deleting the rows from the dashboard. So the credential
// requirement is the design, not an accident of the transport.
//
// Plain .mjs on purpose: no tsx, no new dependency, nothing to install. Same as
// `board-smoke.mjs`, and the same register.

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * The CLI's entry point, resolved as a path and run with this process's own node.
 *
 * Not `npx convex`, and not a shell. `npx` on Windows is a `.cmd` that needs
 * `shell: true` to spawn, and a shell is the thing that would have to be trusted with
 * the JSON argument below — a game name containing a quote is not a hypothetical when
 * the names are user-typed. Handing an argv array to `node` means nothing re-parses
 * it on the way through.
 */
const CONVEX_CLI = resolve(ROOT, 'node_modules/convex/bin/main.js')

/** The litter that actually exists. `board-smoke.mjs` names its games `Board Smoke <ISO>`. */
const DEFAULT_PREFIX = 'Board Smoke '

const USAGE = `
  node scripts/prune-games.mjs [--prefix "<name prefix>"] [--yes] [--push]

    --prefix   which games to match, by the start of their name.
               Defaults to "${DEFAULT_PREFIX}" — the games npm run test:smoke leaves behind.
    --yes      actually delete them. Without it this is a dry run and nothing is written.
    --push     push the local convex/ code to the deployment first, for when
               convex/admin.ts is not deployed there yet.
`

function parseArgs(argv) {
  const options = { prefix: DEFAULT_PREFIX, yes: false, push: false, help: false }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--yes') options.yes = true
    else if (arg === '--push') options.push = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else if (arg === '--prefix') {
      // Read as the next argv entry rather than split on `=`, so a prefix may contain
      // one. The empty string is a legal prefix and means every game, which is why it
      // has to be typed out rather than reachable by leaving the flag off.
      i += 1
      if (i >= argv.length) throw new Error('--prefix needs a value.')
      options.prefix = argv[i]
    } else if (arg === '--all') {
      // Named explicitly so the refusal explains itself. Somebody will try it.
      throw new Error('There is no --all. Pass --prefix "" if you really mean every game.')
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

/**
 * Runs one Convex function and hands back its decoded return value.
 *
 * ⚠️ **stdout is piped rather than inherited, and the parse depends on it.** The CLI
 * prints the function's result with `util.inspect` when its stdout is a terminal and
 * with `JSON.stringify` when it is not — so piping is what makes the output parseable,
 * and inheriting it would hand back something that looks like JSON and is not. stderr
 * is inherited on purpose: the CLI's own progress, warnings and failures are for the
 * person running this, not for us to reformat.
 */
function convexRun(functionName, args, options) {
  const argv = ['run', functionName, JSON.stringify(args)]
  if (options.push) argv.push('--push')

  const result = spawnSync(process.execPath, [CONVEX_CLI, ...argv], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(
      `\`convex run ${functionName}\` exited ${result.status}. ` +
        'If it could not find the function, convex/admin.ts is not on the deployment yet — ' +
        'run `npm run dev:backend` once, or pass --push.',
    )
  }

  const text = result.stdout.trim()
  if (!text) throw new Error(`\`convex run ${functionName}\` returned nothing.`)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Could not read the output of \`convex run ${functionName}\`:\n${text}`)
  }
}

/** `1 scene`, `0 scenes`. A confirmation that reads as English is one people actually read. */
function count(n, noun) {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

function describeCounts(counts) {
  return [
    count(counts.scenes, 'scene'),
    count(counts.tokens, 'token'),
    count(counts.characters, 'character'),
    count(counts.seats, 'seat'),
  ].join(', ')
}

/** `2026-07-30 09:14`. Local time, because the question it answers is "was this me, last night?". */
function whenMade(creationTime) {
  const at = new Date(creationTime)
  const pad = (n) => String(n).padStart(2, '0')
  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ` +
    `${pad(at.getHours())}:${pad(at.getMinutes())}`
  )
}

function describeGame(game) {
  return `  ${game.code}  ${whenMade(game._creationTime)}  ${game.name}\n            ${describeCounts(game.counts)} — created by ${game.createdByName}`
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(USAGE)
    return 0
  }

  if (!existsSync(CONVEX_CLI)) {
    throw new Error(`Cannot find ${CONVEX_CLI}. Run \`npm install\` first.`)
  }

  console.log(`\nPruning games whose name starts with ${JSON.stringify(options.prefix)}\n`)

  // `--push` rides on the first call only. Pushing is per-deployment rather than
  // per-function, so repeating it once per game would be thirty-five bundle-and-deploy
  // round trips to reach the state the first one already reached.
  const listing = convexRun('admin:listByPrefix', { prefix: options.prefix }, { push: options.push })
  const games = listing.games

  if (games.length === 0) {
    console.log('  nothing matches — the deployment is already clean\n')
    return 0
  }

  for (const game of games) {
    console.log(describeGame(game))
  }

  if (listing.truncated) {
    // The bound was reached, so this is a page rather than the answer. Said out loud
    // because the failure mode is silent: delete what you were shown, look again, and
    // conclude the deployment is clean while it is not.
    console.log('\n  ⚠ more games match than this pass could list — run it again afterwards')
  }

  if (!options.yes) {
    console.log(`\nDRY RUN — ${count(games.length, 'game')} would be deleted, nothing was written`)
    console.log(`  to actually delete them: node scripts/prune-games.mjs${
      options.prefix === DEFAULT_PREFIX ? '' : ` --prefix ${JSON.stringify(options.prefix)}`
    } --yes\n`)
    return 0
  }

  console.log('')
  let purged = 0
  const failures = []
  for (const game of games) {
    try {
      // One call per game rather than one call for all of them, so each is its own
      // transaction. A game that refuses — a document limit, a blob that has gone —
      // does not roll back the thirty-four that worked, and the loop can report which
      // one it was instead of leaving the whole pass in doubt.
      const receipt = convexRun('admin:purgeGame', { gameId: game._id }, { push: false })
      purged += 1
      console.log(`  purged ${receipt.code}  ${receipt.name}\n            ${describeCounts(receipt.counts)}`)
    } catch (error) {
      failures.push(`${game.code} — ${error.message ?? error}`)
      console.log(`  FAILED ${game.code}  ${game.name}`)
    }
  }

  console.log(`\n${failures.length === 0 ? 'DONE' : 'FAIL'} — purged ${purged}/${games.length} games\n`)
  // Repeated after the fact as well as before it, because this is the point at which
  // somebody stops reading and assumes the job is finished.
  if (listing.truncated) console.log('  ⚠ more games still match — run this again\n')
  for (const failure of failures) {
    console.log(`  ${failure}`)
  }
  if (failures.length > 0) console.log('')

  return failures.length === 0 ? 0 : 1
}

try {
  process.exit(main())
} catch (error) {
  console.error(`\nFAIL — ${error.message ?? error}\n`)
  process.exit(1)
}
