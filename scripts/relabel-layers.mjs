#!/usr/bin/env node
// TRANSITION ONLY — rewrites the stored `dm` token layer to `gm`, one game at a time.
//
// The GM layer is `'gm'` from Milestone 10 forward, and the schema is in the widened middle
// of widen–migrate–narrow: it accepts both spellings so that rows written before the rename
// still validate, while every argument validator and every projection takes the narrow three
// so no `dm` can be created and none can leave the server. This script is the migrate half.
// When it has run against every deployment and `admin:gamesWithLegacyLayers` reports nothing
// anywhere, the fourth member of the union comes out of `convex/schema.ts` — and this file,
// the two functions in `convex/admin.ts` and the two helpers in `convex/lib/board.ts` are all
// deleted in the same commit. ⚠️ **If you are reading this after that has happened, it should
// not be here.**
//
//   node scripts/relabel-layers.mjs          # dry run — which games still hold old rows
//   node scripts/relabel-layers.mjs --yes    # actually rewrite them
//
// ⚠️ **Dry run by default**, like `prune-games.mjs` next door, and for a weaker reason worth
// stating rather than assuming: this writes one field to one union member and destroys
// nothing, so a mistaken run is recoverable in a way a mistaken purge is not. What the dry
// run is really for is the number — seeing *which* games are affected and how many rows,
// before and after, is the whole of the evidence that the narrowing commit is safe.
//
// ⚠️ **And there is no `--prefix`, which is the exact opposite of that script's refusal to
// take an `--all`.** A purge's default blast radius must be narrow because it deletes; a
// migration's must be everything, because a migration that skips a game is not a migration —
// it leaves one row of the old spelling behind and the narrowing that follows makes that row
// unreadable. Every game the deployment holds, every run.
//
// It shells out to the Convex CLI for `prune-games.mjs`'s reason, and that comment is the
// long version: `ConvexHttpClient` cannot reach an `internalQuery` or an `internalMutation`
// at all, because internal functions are absent from the deployment's public API by
// construction — which is the property that let them be written without first answering who
// may rewrite a stranger's game. `npx convex run` reaches them by holding the deployment's
// admin credentials. The credential requirement is the design rather than an accident of the
// transport.
//
// The spawn helper below is a copy of that script's rather than a shared `scripts/lib/`
// module, deliberately: this file is deleted when the sweep is done, and a two-file shared
// module left behind by a deleted script is exactly the residue this codebase keeps
// complaining about. Plain .mjs on purpose too — no tsx, no new dependency, nothing to
// install.

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * The CLI's entry point, resolved as a path and run with this process's own node.
 *
 * Not `npx convex`, and not a shell. `npx` on Windows is a `.cmd` that needs `shell: true`
 * to spawn, and a shell is the thing that would have to be trusted with the JSON argument —
 * a game name containing a quote is not a hypothetical when the names are user-typed.
 */
const CONVEX_CLI = resolve(ROOT, 'node_modules/convex/bin/main.js')

const USAGE = `
  node scripts/relabel-layers.mjs [--yes] [--push]

    --yes      actually rewrite the rows. Without it this is a dry run and nothing is written.
    --push     push the local convex/ code to the deployment first, for when
               convex/admin.ts is not deployed there yet.
`

function parseArgs(argv) {
  const options = { yes: false, push: false, help: false }

  for (const arg of argv) {
    if (arg === '--yes') options.yes = true
    else if (arg === '--push') options.push = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else if (arg === '--prefix') {
      // Named explicitly so the refusal explains itself, the way prune-games.mjs names
      // `--all`. Somebody who has run that script will reach for this.
      throw new Error(
        'There is no --prefix. A migration that skips games leaves rows the narrowing cannot read.',
      )
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

/**
 * Runs one Convex function and hands back its decoded return value.
 *
 * ⚠️ **stdout is piped rather than inherited, and the parse depends on it.** The CLI prints
 * the function's result with `util.inspect` when its stdout is a terminal and with
 * `JSON.stringify` when it is not — so piping is what makes the output parseable, and
 * inheriting it would hand back something that looks like JSON and is not. stderr is
 * inherited on purpose: the CLI's own progress, warnings and failures are for the person
 * running this.
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

/** `1 token`, `0 tokens`. A receipt that reads as English is one people actually read. */
function count(n, noun) {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
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

  console.log('\nLooking for tokens still stored on the legacy `dm` layer\n')

  // `--push` rides on the first call only. Pushing is per-deployment rather than
  // per-function, so repeating it once per game would be a bundle-and-deploy round trip
  // per game to reach the state the first one already reached.
  const listing = convexRun('admin:gamesWithLegacyLayers', {}, { push: options.push })
  const games = listing.games

  if (games.length === 0) {
    // The sentence the narrowing commit is waiting for. It is only the whole answer when
    // `truncated` is false, which is why the flag is checked below regardless.
    console.log('  nothing to do — no game on this deployment holds a `dm` layer\n')
    if (listing.truncated) {
      console.log('  ⚠ but this pass could not see every game — raise MAX_GAMES_SWEPT\n')
      return 1
    }
    return 0
  }

  const pending = games.reduce((total, game) => total + game.legacy, 0)
  for (const game of games) {
    console.log(`  ${game.code}  ${count(game.legacy, 'token')}  ${game.name}`)
  }

  if (listing.truncated) {
    // Said out loud because the failure mode is silent: rewrite what you were shown, look
    // again, and conclude the deployment is clean while a game beyond the window is not.
    // Unlike prune-games.mjs, running this again will not help — the window starts in the
    // same place every time — so the message names the actual fix.
    console.log(
      '\n  ⚠ more games exist than this pass could sweep — raise MAX_GAMES_SWEPT and re-run',
    )
  }

  if (!options.yes) {
    console.log(
      `\nDRY RUN — ${count(pending, 'token')} across ${count(games.length, 'game')} would be relabelled, nothing was written`,
    )
    console.log('  to actually rewrite them: node scripts/relabel-layers.mjs --yes\n')
    // ⚠️ **Truncation is a non-zero exit in every branch of this script, including this
    // one.** The only question it answers is "may the widening now be removed?", and a pass
    // that could not see every game cannot answer yes — so a report that is incomplete for
    // any reason fails, and a CI step or a shell `&&` reads it correctly without knowing
    // what the warning above means.
    return listing.truncated ? 1 : 0
  }

  console.log('')
  let relabelled = 0
  const failures = []
  for (const game of games) {
    try {
      // One call per game rather than one for all of them, so each is its own transaction.
      // A game that refuses does not roll back the ones that worked, and the loop can name
      // it instead of leaving the whole pass in doubt.
      const receipt = convexRun('admin:relabelDmLayer', { gameId: game._id }, { push: false })
      relabelled += receipt.relabelled
      console.log(
        `  relabelled ${receipt.code}  ${count(receipt.relabelled, 'token')}  ${receipt.name}`,
      )
    } catch (error) {
      failures.push(`${game.code} — ${error.message ?? error}`)
      console.log(`  FAILED ${game.code}  ${game.name}`)
    }
  }

  const ok = failures.length === 0
  console.log(
    `\n${ok ? 'DONE' : 'FAIL'} — relabelled ${count(relabelled, 'token')} across ${games.length - failures.length}/${count(games.length, 'game')}\n`,
  )
  // Repeated after the fact as well as before it, because this is the point at which
  // somebody stops reading and assumes the deployment is clean.
  if (listing.truncated) {
    console.log('  ⚠ games beyond the sweep window were never looked at\n')
  }
  for (const failure of failures) {
    console.log(`  ${failure}`)
  }
  if (!ok) console.log('')

  // Re-running after a failure is safe: `relabelDmLayer` patches only the rows that still
  // carry the old spelling, so a game that succeeded reports zero the second time.
  return ok && !listing.truncated ? 0 : 1
}

try {
  process.exit(main())
} catch (error) {
  console.error(`\nFAIL — ${error.message ?? error}\n`)
  process.exit(1)
}
