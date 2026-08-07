// Reading the twelve 2024 classes out of `classes.md` and printing what a library sheet
// has to be written against. **This one prints a briefing rather than TypeScript**, and
// that difference is the whole design of it.
//
// `spells.mjs` and `creatures.mjs` emit scaffold entries because a spell and a stat block
// are *records* — a level, a category, a dice expression — and a scaffold gets 97% of a
// record right. A **library sheet is a build**: which two skills, which weapon, where the
// standard array goes, what the level 4 improvement buys, and which four of a Wizard's
// spells a beginner should have. None of that is in the source, so a generator that
// emitted `LibrarySheet` literals would be emitting sixty guesses wearing the authority of
// generated code.
//
// What *is* in the source, and what nobody should be reading off a 298 KB file by eye, is
// the **level table**: which features arrive at which level, and what every per-class
// counter reads at levels 1 to 5. That is what this prints — one compact block per class,
// levels 1–5 only, with the subclass's own table beside it. The sheets are then written by
// hand against it, which is the same division `scripts/srd/README.md` already draws between
// a scaffold's mechanical fields and the prose written over the top.
//
// ⚠️ **The SRD is never copied into this repository.** The path is an argument, then an
// environment variable, then a default outside the tree — the convention the other two
// scripts state at length.
//
// Usage:
//
// ```bash
// node scripts/srd/classes.mjs                       # the default path
// node scripts/srd/classes.mjs /elsewhere/classes.md # an argument
// SRD_CLASSES=/elsewhere/classes.md node scripts/srd/classes.mjs
// node scripts/srd/classes.mjs --features Monk       # every feature's prose, levels 1-5
// node scripts/srd/classes.mjs --features all        # all twelve, which is long
// ```

import { readFileSync } from 'node:fs'

const DEFAULT_PATH = 'D:/Git/dnd-5e-srd/classes.md'

/** The levels the library covers. `MAX_LIBRARY_LEVEL` in convex/lib/classes.ts, copied. */
const MAX_LEVEL = 5

function stripTags(html) {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&emsp;|&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * One HTML table as `{ headers, rows }`.
 *
 * The SRD's class tables are hand-written HTML rather than markdown pipes, and the header
 * row is what names the per-class counters — `Rages`, `Focus Points`, `Sneak Attack`,
 * `Spell Slots per Spell Level`. Those names are the reason this is parsed at all: a
 * library sheet's `uses` field is exactly one of those columns, and reading the wrong one
 * is how a Monk ends up with a Sorcerer's recharge.
 */
function parseTable(html) {
  const headers = [...html.matchAll(/<th>([\s\S]*?)<\/th>/g)].map((m) => stripTags(m[1]))
  const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
    .map((row) => [...row[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((m) => stripTags(m[1])))
    .filter((cells) => cells.length > 0)
  return { headers, rows }
}

/** Every `<table>` in a block, in document order. */
function tablesIn(block) {
  return [...block.matchAll(/<table>[\s\S]*?<\/table>/g)].map((m) => parseTable(m[0]))
}

/**
 * The class's own level table — the one whose first column is a bare level number.
 *
 * Chosen by shape rather than by position, because a class block holds two to four tables:
 * the Core Traits pairs, the features table, and for a caster sometimes a second one. The
 * features table is the only one whose first data cell is `1`.
 */
function featureTable(tables) {
  return tables.find((table) => table.rows.length >= 20 && table.rows[0][0] === '1') ?? null
}

/** The Core Traits table: two columns, a label and a value. */
function coreTraits(tables) {
  const table = tables.find(
    (candidate) => candidate.headers.length === 0 && candidate.rows.every((row) => row.length === 2),
  )
  if (!table) return {}
  return Object.fromEntries(table.rows.map(([label, value]) => [label, value]))
}

/**
 * `#### Level 3: Primal Knowledge` → the feature's prose, keyed by `3|Primal Knowledge`.
 *
 * Keyed by level as well as name because two classes grant same-named features at
 * different levels, and because the level is the thing a sheet is filed under.
 */
function featureProse(block) {
  const out = new Map()
  const headings = [...block.matchAll(/^#{4}\s+Level (\d+):\s*(.+)$/gm)]
  headings.forEach((heading, index) => {
    const start = heading.index + heading[0].length
    const end = index + 1 < headings.length ? headings[index + 1].index : block.length
    const level = Number(heading[1])
    out.set(`${level}|${heading[2].trim()}`, block.slice(start, end).trim())
  })
  return out
}

/** Every `## Name` block in the file, keyed by name. */
function classBlocks(text) {
  const out = new Map()
  const headings = [...text.matchAll(/^##\s+(?!#)(.+)$/gm)]
  headings.forEach((heading, index) => {
    const start = heading.index + heading[0].length
    const end = index + 1 < headings.length ? headings[index + 1].index : text.length
    out.set(heading[1].trim(), text.slice(start, end))
  })
  return out
}

/** `### Barbarian Subclass: Path of the Berserker` → its name and its slice of the block. */
function subclassIn(block) {
  const match = /^###\s+\w+ Subclass:\s*(.+)$/m.exec(block)
  if (!match) return null
  return { name: match[1].trim(), body: block.slice(match.index) }
}

function main() {
  const path = process.argv.find((arg) => arg.endsWith('.md')) ?? process.env.SRD_CLASSES ?? DEFAULT_PATH
  const wanted = process.argv.includes('--features')
    ? process.argv[process.argv.indexOf('--features') + 1]
    : null

  const text = readFileSync(path, 'utf8')
  const blocks = classBlocks(text)

  let classes = 0
  for (const [name, block] of blocks) {
    const tables = tablesIn(block)
    const features = featureTable(tables)
    if (!features) continue
    classes += 1

    const traits = coreTraits(tables)
    const subclass = subclassIn(block)

    process.stdout.write(`\n${'='.repeat(78)}\n${name.toUpperCase()}\n${'='.repeat(78)}\n`)
    for (const key of [
      'Hit Point Die',
      'Saving Throw Proficiencies',
      'Skill Proficiencies',
      'Weapon Proficiencies',
      'Armor Training',
      'Tool Proficiencies',
      'Starting Equipment',
    ]) {
      if (traits[key]) process.stdout.write(`${key}: ${traits[key]}\n`)
    }
    process.stdout.write(`Subclass: ${subclass ? subclass.name : '(none found)'}\n\n`)

    process.stdout.write(`${features.headers.join(' | ')}\n`)
    for (const row of features.rows) {
      if (Number(row[0]) > MAX_LEVEL) break
      process.stdout.write(`${row.join(' | ')}\n`)
    }

    if (subclass) {
      const subTable = tablesIn(subclass.body)[0]
      if (subTable) {
        process.stdout.write(`\n  ${subclass.name}: ${subTable.headers.join(' | ')}\n`)
        for (const row of subTable.rows) {
          if (Number(row[0]) > MAX_LEVEL) break
          process.stdout.write(`  ${row.join(' | ')}\n`)
        }
      }
      const subFeatures = [...subclass.body.matchAll(/^#{4}\s+Level (\d+):\s*(.+)$/gm)]
        .filter((match) => Number(match[1]) <= MAX_LEVEL)
        .map((match) => `L${match[1]} ${match[2].trim()}`)
      process.stdout.write(`  ${subclass.name} features 1-${MAX_LEVEL}: ${subFeatures.join(', ')}\n`)
    }

    if (wanted && (wanted === 'all' || name.toLowerCase() === wanted.toLowerCase())) {
      process.stdout.write(`\n${'-'.repeat(78)}\nFEATURE PROSE, LEVELS 1-${MAX_LEVEL}\n`)
      for (const [key, prose] of featureProse(block)) {
        if (Number(key.split('|')[0]) > MAX_LEVEL) continue
        process.stdout.write(`\n### ${key}\n${prose}\n`)
      }
    }
  }

  // stderr carries the count, so stdout stays redirectable — `spells.mjs`' convention.
  process.stderr.write(`read ${classes} classes from ${path}\n`)
  if (classes !== 12) {
    process.stderr.write(`⚠️  expected 12 classes; the parser or the source has moved\n`)
  }
}

main()
