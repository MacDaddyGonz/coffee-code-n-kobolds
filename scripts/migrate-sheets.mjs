#!/usr/bin/env node
// Sweeps stored character sheets onto the 5e (2024) schema. A maintenance tool, not a
// feature, and a **transition** one: it is deleted once every deployment has run it.
//
// Milestone 14 widened the schema everywhere and swept nothing. This is the migrate half
// of widen → migrate → narrow, and it changes six things about the documents in a game:
//
//   1. a premade character's `race` becomes `species`, and `race` is dropped
//   2. an archetype that no longer resolves is cleared, and the sheet unlocked
//   3. the five 2024 skill flags are back-filled `false` on every hand-built hero
//   4. …and inside a premade character's override diff, which is the second place they live
//   5. a hand-built sheet with no `speed` is pinned to 35, the number it already meant
//   6. `characterVitals.spentPerRest` is folded into the counted `spentUses`
//
//   node scripts/migrate-sheets.mjs           # dry run — reports, writes nothing
//   node scripts/migrate-sheets.mjs --yes     # actually rewrite them
//
// ⚠️ **DRY RUN BY DEFAULT, and the dry run is a different Convex function rather than a
// flag.** `admin:listUnmigrated` is an `internalQuery`, which has no `patch`, no `insert`
// and no `replace` — so "the rehearsal wrote nothing" is a property of what it is, not a
// promise about what it does. `--yes` is what reaches `admin:migrateGame`, and nothing
// below can reach it without one.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// ⚠️⚠️ THE RUNBOOK. READ THIS BEFORE DEPLOYING ANYTHING.
// ═══════════════════════════════════════════════════════════════════════════════════
//
// **THE SWEEP AND THE NARROWINGS ARE TWO DEPLOYS AND THEY CANNOT BE ONE.** Convex
// validates **existing rows** on a schema push — the fact ADR 0016 records `npx convex
// deploy` discovering over a character created months ago — so a deployment holding a
// single unswept row refuses the narrowed schema **outright, for the whole deploy**.
// All three narrowings block it: every stored `preset` carries a `race`, every stored
// `pc` sheet with `skillProficiencies` carries thirteen booleans where the narrow
// validator wants eighteen, and every `characterVitals` row that ever spent a
// once-per-rest ability carries a `spentPerRest`.
//
// This is `chore/narrow-token-layer`'s shape a second time — the `dm` → `gm` layer
// rename, recorded in the DM-tooling milestone's Done block in docs/roadmap.md. It ran
// as four steps and so does this one, and the property that makes it safe rather than
// merely careful is the same: **the narrow schema IS the proof the sweep landed.** Step 4
// cannot succeed early, so nothing has to be trusted.
//
//   1. **Deploy the sweep commit** — the wide schema plus `convex/lib/migrate.ts`,
//      `convex/admin.ts`'s `listUnmigrated` and `migrateGame`, and this script. It is the
//      first of the two commits on `chore/m14-migration` and it stands on its own.
//   2. **Rehearse.** `npm run migrate-sheets` — a dry run, which writes nothing because
//      it only ever calls a query. Read the per-game counts.
//   3. **Sweep.** `npm run migrate-sheets -- --yes`, repeated until it reports nothing
//      left. Safe to re-run: a swept game patches no document at all on a second pass.
//   4. **Deploy the narrowing commit.** If it is refused, the sweep is not finished —
//      go back to 3 rather than editing the schema.
//
// 🚫 **DO NOT push a tree containing the narrowing commit before step 3 is done.** The
// deployment refuses it with `Document … in table "characters" does not match the
// schema`, which is the honest error and the whole story in one line. That failure is
// **safe** — a refused push writes nothing and changes nothing — and `--push` from such a
// tree fails the same way, which is why the flag is still offered here.
//
// ⚠️ **TAKE A SNAPSHOT EXPORT FIRST. THERE IS NO UNDO.** This rewrites `characters` and
// `characterVitals` in place, up to two hundred documents per game in one transaction,
// and nothing anywhere records what a document said before. The Convex dashboard's
// snapshot export is the whole of the recovery plan.
//
// ⚠️ **Run it promptly after step 1, because it does NOT converge on a deployment people
// are still playing on.** Item 5 pins a hand-built sheet whose `speed` is *absent* — and a
// blank hero created five minutes ago has an absent speed too, because `defaultPcSheet()`
// omits the field on purpose. The two rows are indistinguishable, so every new character
// made after the constant moved is another pinnable sheet: this tool will keep finding
// work for as long as anybody keeps making heroes. `PRE_2024_SPEED_FEET` in
// convex/lib/migrate.ts carries the argument and names the creation-time cutoff that would
// fix it. The practical rule is that this is transition code and not a cron job.
//
// ⚠️ **Expect it to re-push subscriptions.** Every patched character invalidates
// `characters.list` and `characters.sheet` for its game, and every patched vitals row
// invalidates the health-bar feed. Harmless on an idle deployment, noticeable if it is run
// during a session.
//
// ═══════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ **It shells out to the Convex CLI, and that is not laziness.** `ConvexHttpClient` —
// which `board-smoke.mjs` next door uses for everything — cannot call these functions,
// because they are `internalQuery` and `internalMutation` and internal functions are
// absent from the deployment's public API by construction. That is the property that let
// them be written without first answering "who may rewrite every sheet in a game".
// `npx convex run` reaches them by holding the deployment's admin credentials, which is
// the same authority as editing the rows from the dashboard.
//
// Plain .mjs on purpose: no tsx, no new dependency, nothing to install. Same as
// `prune-games.mjs`, and the same register.

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * The CLI's entry point, resolved as a path and run with this process's own node.
 *
 * Not `npx convex`, and not a shell — `prune-games.mjs` carries the argument at length:
 * `npx` on Windows is a `.cmd` that needs `shell: true`, and a shell is the thing that
 * would have to be trusted with the JSON argument below.
 */
const CONVEX_CLI = resolve(ROOT, 'node_modules/convex/bin/main.js')

/**
 * How many games one listing call examines.
 *
 * ⚠️ **Small, and the smallness is the point.** Deciding whether a game needs sweeping
 * means reading its characters and its vitals — up to 400 rows apiece — because *needs
 * migrating* is a question about the contents of a `sheet` field and no index can carry
 * it. Twenty-five games is up to ten thousand documents in one query, which is inside
 * what a Convex query may read and not by a wide margin. The cursor is what makes the
 * whole deployment reachable at that size.
 */
const PAGE_SIZE = 25

/**
 * How many pages one run will walk before giving up.
 *
 * A loop over a cursor a server hands back is a loop somebody has to bound. `isDone` is
 * what actually ends it; this is the net underneath, and reaching it is reported rather
 * than shrugged off — the same reason `listByPrefix` has a `truncated` flag.
 */
const MAX_PAGES = 200

const USAGE = `
  node scripts/migrate-sheets.mjs [--yes] [--push]

    --yes      actually rewrite the sheets. Without it this is a dry run and nothing
               is written.
    --push     push the local convex/ code to the deployment first, for when
               convex/admin.ts is not deployed there yet. See the header: this is
               refused by the deployment if the working tree already narrows the schema.
`

function parseArgs(argv) {
  const options = { yes: false, push: false, help: false }

  for (const arg of argv) {
    if (arg === '--yes') options.yes = true
    else if (arg === '--push') options.push = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

/**
 * Runs one Convex function and hands back its decoded return value.
 *
 * ⚠️ **stdout is piped rather than inherited, and the parse depends on it.** The CLI
 * prints the function's result with `util.inspect` when its stdout is a terminal and with
 * `JSON.stringify` when it is not — so piping is what makes the output parseable, and
 * inheriting it would hand back something that looks like JSON and is not. stderr is
 * inherited on purpose: the CLI's own progress, warnings and failures are for the person
 * running this, not for us to reformat.
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
        'run `npm run dev:backend` once, or pass --push. If the push itself was refused ' +
        'over a document not matching the schema, read the header of this file: the ' +
        'narrowed schema cannot be pushed until this sweep has run.',
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

/** `1 sheet`, `0 sheets`. A confirmation that reads as English is one people actually read. */
function count(n, noun) {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

/**
 * The six numbers, in the order the header lists the six changes, and **only the ones
 * that are not nought.**
 *
 * Six zeroes printed against every game would bury the one line an operator is looking
 * for. A game that needs nothing is never printed at all, so there is always at least
 * one term here.
 */
function describeCounts(counts) {
  const parts = [
    counts.species > 0 && count(counts.species, 'species key'),
    counts.archetypes > 0 && count(counts.archetypes, 'retired archetype'),
    counts.skills > 0 && count(counts.skills, 'skill list'),
    counts.overrideSkills > 0 && count(counts.overrideSkills, 'override skill list'),
    counts.speeds > 0 && count(counts.speeds, 'pinned speed'),
    counts.uses > 0 && count(counts.uses, 'spent-use list'),
  ].filter(Boolean)
  return parts.length === 0 ? 'nothing' : parts.join(', ')
}

function totalOf(counts) {
  return (
    counts.species +
    counts.archetypes +
    counts.skills +
    counts.overrideSkills +
    counts.speeds +
    counts.uses
  )
}

function addCounts(a, b) {
  return {
    species: a.species + b.species,
    archetypes: a.archetypes + b.archetypes,
    skills: a.skills + b.skills,
    overrideSkills: a.overrideSkills + b.overrideSkills,
    speeds: a.speeds + b.speeds,
    uses: a.uses + b.uses,
  }
}

const NO_COUNTS = {
  species: 0,
  archetypes: 0,
  skills: 0,
  overrideSkills: 0,
  speeds: 0,
  uses: 0,
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

/**
 * Every game with work outstanding, walked page by page.
 *
 * ⚠️ **A page can come back empty while `isDone` is false**, and the loop is written for
 * it rather than around it: the server pages over *games* and filters to the ones needing
 * work afterwards, because there is no index on "has an unswept sheet" and there could
 * not be. Stopping at the first empty page would report a clean deployment on the
 * strength of twenty-five tidy games.
 *
 * `--push` rides on the first call only. Pushing is per-deployment rather than
 * per-function, so repeating it once per page would be a bundle-and-deploy round trip
 * for a state the first one already reached.
 */
function collectCandidates(options) {
  const games = []
  let cursor = null
  let pages = 0

  for (;;) {
    const push = options.push && pages === 0
    const result = convexRun(
      'admin:listUnmigrated',
      { paginationOpts: { numItems: PAGE_SIZE, cursor } },
      { push },
    )
    pages += 1
    games.push(...result.page)

    if (result.isDone) return { games, truncated: false, pages }
    if (pages >= MAX_PAGES) return { games, truncated: true, pages }
    cursor = result.continueCursor
  }
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

  console.log('\nSweeping stored sheets onto the 5e (2024) schema\n')

  const listing = collectCandidates(options)
  const games = listing.games

  if (games.length === 0) {
    console.log(`  nothing to do — every game this pass examined is already swept\n`)
    return 0
  }

  for (const game of games) {
    console.log(describeGame(game))
  }

  const planned = games.reduce((sum, game) => addCounts(sum, game.counts), NO_COUNTS)
  console.log(`\n  in total: ${describeCounts(planned)}`)

  if (listing.truncated) {
    // The page bound was reached, so this is a prefix of the answer rather than the
    // answer. Said out loud because the failure mode is silent: sweep what you were
    // shown, look again, and conclude the deployment is clean while it is not.
    console.log('\n  ⚠ the page bound was reached — run this again afterwards')
  }

  if (!options.yes) {
    console.log(
      `\nDRY RUN — ${count(games.length, 'game')} would be rewritten, nothing was written`,
    )
    console.log('  to actually rewrite them: node scripts/migrate-sheets.mjs --yes\n')
    return 0
  }

  console.log('')
  let migrated = 0
  let applied = NO_COUNTS
  const failures = []
  for (const game of games) {
    try {
      // One call per game rather than one call for all of them, so each is its own
      // transaction. A game that refuses does not roll back the ones that worked, and
      // the loop can name it instead of leaving the whole pass in doubt.
      const receipt = convexRun('admin:migrateGame', { gameId: game._id }, { push: false })
      migrated += 1
      applied = addCounts(applied, receipt.counts)
      console.log(
        `  swept ${receipt.code}  ${receipt.name}\n            ${describeCounts(receipt.counts)}`,
      )
    } catch (error) {
      failures.push(`${game.code} — ${error.message ?? error}`)
      console.log(`  FAILED ${game.code}  ${game.name}`)
    }
  }

  console.log(`\n${failures.length === 0 ? 'DONE' : 'FAIL'} — swept ${migrated}/${games.length} games`)
  console.log(`  applied: ${describeCounts(applied)}`)
  // ⚠️ Read against the plan by eye. The dry run and the receipt are the same six
  // numbers on purpose, and a mismatch is the only sign anybody would get that something
  // wrote to a game between the two calls.
  if (totalOf(applied) !== totalOf(planned) && failures.length === 0) {
    console.log('  ⚠ that is not what the listing predicted — something else wrote in between')
  }
  console.log('')
  // Repeated after the fact as well as before it, because this is the point at which
  // somebody stops reading and assumes the job is finished.
  if (listing.truncated) console.log('  ⚠ more games may still need sweeping — run this again\n')
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
