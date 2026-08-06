#!/usr/bin/env node
// Reads the SRD 5.2.1 spell chapter and prints the `SPELLS` block of
// convex/lib/rules.ts. A BUILD-TIME SOURCE, NOT A SHIPPED MODULE — see the README
// beside this file for why it lives in scripts/ and not under convex/ or src/.
//
// Usage:
//   node scripts/srd/spells.mjs [path/to/spells.md] > /tmp/spells.ts
//   SRD_SPELLS=/elsewhere/spells.md node scripts/srd/spells.mjs
//
// The path is an argument with an env-var fallback and a default, because the SRD
// checkout is deliberately OUTSIDE this repository: no SRD file is copied in, so
// there is no path inside the tree this could default to and no way for a stale copy
// to drift. A machine without the checkout gets an error naming the file it wanted.
//
// ⚠️ WHAT THIS EMITS IS A SCAFFOLD AND NOT THE ANSWER. It derives the facts that are
// mechanical — the level, the category, the dice, the casting time, the duration —
// and assembles a placeholder sentence from them. **The prose in rules.ts is written
// by hand on top of that**, because the corpus promises a paraphrase for a DM reading
// it at the table rather than SRD text, and because MAX_ENTRY_TEXT_LENGTH is 600 and
// SRD spell prose routinely runs past it. Re-running this is therefore not a refresh:
// it is a fresh scaffold to DIFF against, and the diff is what tells you which spells
// the source changed.

import { readFileSync } from 'node:fs'

const DEFAULT_SOURCE = 'D:/Git/dnd-5e-srd/spells.md'

/** Levels 1–5 of play cap a slot at 3rd, so this is the whole of the milestone's range. */
const MAX_LEVEL = 3

/**
 * A copy of `ROLL_PATTERN` from convex/lib/sheet.ts, and deliberately a copy.
 *
 * This script is outside every guard sweep by construction (see the README), which
 * means it may not import from `convex/` — and a scaffold that quietly emitted a roll
 * the real grammar refuses would fail in `rules.test.ts` instead of here, one step
 * further from the line that produced it. So the check is duplicated, and the thing
 * that keeps the copy honest is that the real one runs over the committed output.
 */
const ROLL_PATTERN =
  /^(?:[1-9]|[1-4]\d|50)d(?:2|4|6|8|10|12|20|100)(?:[+-](?:\d{1,3}|STR|DEX|CON|INT|WIS|CHA|PROF))*$/

/**
 * Which ability a caster of this spell most often uses, in the order the corpus
 * resolves ties.
 *
 * The commonest caster rather than the only one, which is the rule `rules.ts` already
 * states for its damage tokens: the copy on the sheet is editable precisely so a
 * paladin can change a cleric's WIS to CHA.
 *
 * ⚠️ **An ORDER and not a lookup on the first class named, which was the first thing
 * tried and is wrong in a way that looks right.** The SRD lists a spell's classes
 * alphabetically, so "first named" answers *Sorcerer* for Fire Bolt and would have
 * rewritten the corpus's `1d20+INT+PROF` — an iconic wizard cantrip re-keyed to
 * Charisma because B comes before W. Wizard first, then the two Wisdom classes, then
 * the Charisma ones, reproduces every to-hit the corpus already had and settles the
 * fourteen new ones the same way.
 */
const ABILITY_BY_CLASS = [
  ['Wizard', 'INT'],
  ['Cleric', 'WIS'],
  ['Druid', 'WIS'],
  ['Ranger', 'WIS'],
  ['Bard', 'CHA'],
  ['Sorcerer', 'CHA'],
  ['Warlock', 'CHA'],
  ['Paladin', 'CHA'],
]

function slug(name) {
  return name
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Split the chapter into `#### Name` blocks and keep the ones that are spells. */
function parse(markdown) {
  const blocks = markdown.split(/^#### /m).slice(1)
  const spells = []
  for (const block of blocks) {
    const newline = block.indexOf('\n')
    const name = block.slice(0, newline).trim()
    const rest = block.slice(newline + 1)
    const header = rest.match(/^_(?:Level (\d) (\w+)|(\w+) Cantrip) \(([^)]+)\)_/m)
    // Not a spell: the chapter opens with a dozen explanatory sections at the same
    // heading depth. A block with no `_Level N School (Classes)_` line is one of them.
    if (!header) continue
    const level = header[1] === undefined ? 0 : Number(header[1])
    const field = (label) => {
      const match = rest.match(new RegExp(`^\\*\\*${label}:\\*\\* (.+)$`, 'm'))
      return match ? match[1].trim() : ''
    }
    const bodyStart = rest.indexOf('**Duration:**')
    const body = bodyStart === -1 ? '' : rest.slice(rest.indexOf('\n', bodyStart) + 1).trim()
    spells.push({
      key: slug(name),
      name,
      level,
      school: header[2] ?? header[3],
      classes: header[4].split(',').map((c) => c.trim()),
      castingTime: field('Casting Time'),
      range: field('Range'),
      components: field('Components'),
      duration: field('Duration'),
      body,
    })
  }
  return spells
}

/**
 * WHICH SHAPE OF ROLL THIS SPELL IS — the one derivation in this script that is a
 * judgement rather than a lookup, and the one most worth checking by hand.
 *
 * The category describes the ROLLING and not the fiction (see `SHEET_ENTRY_CATEGORIES`
 * in convex/lib/sheet.ts), so it falls out of two questions the body answers: does a
 * spell attack have to land first, and are there any dice at all.
 */
function categorise(spell) {
  if (/\bspell attack\b/i.test(spell.body)) return 'weapon'
  if (firstDice(spell) !== null) return 'action'
  return 'passive'
}

/**
 * The body with its scaling tail cut off.
 *
 * ⚠️ **Every entry ends in a `_Cantrip Upgrade._` or `_Using a Higher-Level Spell
 * Slot._` paragraph, and both are full of dice that are not the spell's damage.** Read
 * whole, Shillelagh's body offers `2d6` — the level-17 upgrade of a die it describes as
 * "a d8" everywhere it matters — and True Strike offers `1d6` for the same reason. Both
 * would have been minted as `action`s that roll a number nobody at levels 1–5 will ever
 * roll. Cutting the tail is what makes "the first dice in the body" mean the damage.
 */
function effect(spell) {
  const cut = spell.body.search(/_(?:Cantrip Upgrade|Using a Higher-Level Spell Slot)\._/)
  return cut === -1 ? spell.body : spell.body.slice(0, cut)
}

/**
 * The first `NdM` in the effect — the damage or the healing.
 *
 * A spell whose dice the grammar cannot express comes back null and is reported, which
 * is the one line of this script's output worth reading every run: `roll: null` on
 * something that clearly rolls means the dice have to go in the prose instead.
 */
function firstDice(spell) {
  const match = effect(spell).match(/\b(\d{1,2})d(\d{1,3})\b/)
  if (!match) return null
  const roll = `${Number(match[1])}d${Number(match[2])}`
  return ROLL_PATTERN.test(roll) ? roll : null
}

/** The ability of the class that most often casts this one. */
function abilityFor(spell) {
  const found = ABILITY_BY_CLASS.find(([name]) => spell.classes.includes(name))
  return found ? found[1] : 'INT'
}

/**
 * The damage or healing, with the caster's ability token appended when the SRD says the
 * spellcasting modifier is added.
 *
 * The token rather than a number, for the reason `rules.ts` gives at length: Milestone 4
 * resolves it against the sheet holding the entry, and a number frozen here would be
 * wrong for everyone but the character it was written for.
 */
function rollFor(spell) {
  const dice = firstDice(spell)
  if (dice === null) return null
  if (!/spellcasting ability modifier/.test(effect(spell))) return dice
  return `${dice}+${abilityFor(spell)}`
}

/** A caster's to-hit, in the ability of the class that most often casts the spell. */
function toHitFor(spell) {
  return `1d20+${abilityFor(spell)}+PROF`
}

/**
 * The casting time, shortened to the part a DM reads at speed.
 *
 * ⚠️ **The SRD writes a reaction's whole trigger into the casting time** — Shield's runs
 * to seventy-eight characters and Divine Smite's to eighty-nine — and a paraphrase capped
 * at 600 cannot afford to open with one. The trigger is not lost: it is the first thing
 * the hand-written prose says, which is where somebody skimming a sheet will look for it.
 */
function castingTime(spell) {
  return spell.castingTime
    .replace(/,.*$/, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\bRitual\b/, 'ritual')
}

/** `Action · Concentration, up to 1 minute.` — the tag every paraphrase opens with. */
function timing(spell) {
  return `${castingTime(spell)} · ${spell.duration}.`
}

function emit(spells) {
  const lines = ['export const SPELLS: readonly CatalogueEntry[] = [']
  for (const spell of spells) {
    const category = categorise(spell)
    const roll = category === 'passive' ? null : rollFor(spell)
    lines.push('  {')
    lines.push(`    key: '${spell.key}',`)
    lines.push(`    name: ${JSON.stringify(spell.name)},`)
    lines.push(`    // TODO paraphrase. ${spell.range}, ${spell.components}, ${spell.school}.`)
    lines.push(`    text: ${JSON.stringify(`${timing(spell)}`)},`)
    lines.push(`    roll: ${roll === null ? 'null' : `'${roll}'`},`)
    lines.push(`    level: ${spell.level},`)
    lines.push(`    category: '${category}',`)
    if (category === 'weapon') lines.push(`    toHit: '${toHitFor(spell)}',`)
    lines.push('  },')
  }
  lines.push(']')
  return lines.join('\n')
}

const source = process.argv[2] ?? process.env.SRD_SPELLS ?? DEFAULT_SOURCE
let markdown
try {
  markdown = readFileSync(source, 'utf8')
} catch {
  console.error(`Cannot read ${source}. Pass the path to the SRD's spells.md, or set SRD_SPELLS.`)
  process.exit(1)
}

const all = parse(markdown)
const inRange = all.filter((spell) => spell.level <= MAX_LEVEL)

// The counts go to stderr so that stdout is only ever the TypeScript block, and a
// count that disagrees with the milestone's is the first thing a reviewer should see.
const byLevel = {}
for (const spell of all) byLevel[spell.level] = (byLevel[spell.level] ?? 0) + 1
console.error(`parsed ${all.length} spells; by level: ${JSON.stringify(byLevel)}`)
console.error(`in range (level <= ${MAX_LEVEL}): ${inRange.length}`)

const shapes = {}
for (const spell of inRange) shapes[categorise(spell)] = (shapes[categorise(spell)] ?? 0) + 1
console.error(`categories: ${JSON.stringify(shapes)}`)

// ⚠️ The one report worth reading every time: a spell whose damage the grammar cannot
// express. It gets `roll: null` and has to say its dice in its prose instead.
const unrollable = inRange.filter(
  (spell) => categorise(spell) !== 'passive' && rollFor(spell) === null,
)
if (unrollable.length > 0) {
  console.error(`dice the grammar cannot express: ${unrollable.map((s) => s.key).join(', ')}`)
}

console.log(emit(inRange))
