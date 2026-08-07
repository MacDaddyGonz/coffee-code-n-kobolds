// Reading a 2024 SRD stat block into a plain object. **No opinions about this
// application's shapes live here** — that is `creatures.mjs`' job, and the split is what
// lets the parser be checked against the SRD's own printed numbers (235 stat blocks, 95
// animals) before anything decides what a `BestiaryEntry` should say.
//
// ⚠️ **The SRD is never copied into this repository.** This module takes a directory path
// and reads it in place; `creatures.mjs` documents where that path comes from. The output
// of the pipeline is generated TypeScript, which *is* committed.
//
// The markdown is not uniform between the two source files and that is the first thing to
// know before editing:
//
//   - `monsters-A-Z.md` puts a stat block at `###` and its sections at `####`, under a `##`
//     group heading that sometimes holds several blocks (`## Black Dragons` → four).
//   - `animals.md` puts a stat block at `##` and its sections at `###`.
//
// So the heading depth of a stat block is a property of the file, not of the document, and
// both are passed in explicitly rather than sniffed.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** The two source files, with the heading depth a stat block sits at in each. */
export const SOURCES = [
  { file: 'monsters-A-Z.md', depth: 3, origin: 'monsters' },
  { file: 'animals.md', depth: 2, origin: 'animals' },
]

/** `1/8` → 0.125. The SRD prints eighths, quarters and halves as fractions. */
function parseCr(raw) {
  const text = raw.trim()
  if (text.includes('/')) {
    const [top, bottom] = text.split('/')
    return Number(top) / Number(bottom)
  }
  return Number(text)
}

/**
 * The SRD uses U+2212 MINUS SIGN in its modifier and save columns — `−1`, not `-1`.
 * Every number that crosses out of this module goes through here, because `Number('−1')`
 * is `NaN` and a `NaN` Dexterity would reach the corpus as a silent zero.
 */
function num(raw) {
  return Number(String(raw).replace(/−/g, '-').replace(/[,\s]/g, ''))
}

function stripTags(html) {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&emsp;/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Markdown emphasis removed, so `**_Bite._**` reads as `Bite.`. */
function stripEmphasis(text) {
  return text.replace(/\*\*/g, '').replace(/_/g, '').trim()
}

/**
 * The six ability scores out of the HTML table the 2024 layout uses.
 *
 * ⚠️ **The table carries three columns per ability — score, MOD and SAVE — and all three
 * are read.** The save is not the modifier plus proficiency in every case (a monster may
 * have a save the SRD simply prints), so taking the printed number is the only way to get
 * `Ancient Black Dragon: DEX +9, save +9` and `Aboleth: DEX −1, save +3` both right.
 */
function parseAbilityTable(block) {
  const table = /<table>[\s\S]*?<\/table>/.exec(block)
  if (!table) return null

  const cells = [...table[0].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((m) => stripTags(m[1]))
  const abilities = {}
  const saves = {}
  // Cells come in runs of four: the abbreviation, the score, the modifier, the save.
  for (let i = 0; i + 3 < cells.length; i += 4) {
    const key = cells[i].toLowerCase()
    if (!['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(key)) continue
    abilities[key] = num(cells[i + 1])
    saves[key] = num(cells[i + 3])
  }
  return Object.keys(abilities).length === 6 ? { abilities, saves } : null
}

/**
 * One `**_Name._** text` entry out of a section body.
 *
 * The SRD writes a recharge or a limit inside the name — `**_Dominate Mind (2/Day)._**` —
 * and that parenthetical is kept on the name rather than moved into the text, because it is
 * how the SRD identifies the feature and a reader looking for it will look there.
 */
function parseEntries(body) {
  const out = []
  // Split on the bolded lead-in, which is the only reliable delimiter: the text after it
  // may contain any amount of italics, tables and `<br>`.
  const parts = body.split(/(?=\*\*_)/g)
  for (const part of parts) {
    const match = /^\*\*_(.+?)\._?\*\*\s*([\s\S]*)$/.exec(part.trim())
    if (!match) continue
    const name = stripEmphasis(match[1])
    // ⚠️ **U+2212 folded to ASCII here, once, for the whole entry.** The SRD writes
    // `1 (1d4 − 1) Piercing damage` with a real minus sign, so a dice pattern spelled
    // `[+-]` silently reads `1d4` and drops the modifier — the damage is then 25% high on
    // every creature written that way, and nothing downstream can tell.
    const text = stripTags(stripEmphasis(match[2])).replace(/−/g, '-')
    if (name === '') continue
    out.push({ name, text })
  }
  return out
}

/**
 * The attack-roll and save-DC facts out of one entry's text.
 *
 * A 2024 action reads `_Melee Attack Roll:_ +5, reach 5 ft. _Hit:_ 7 (1d10 + 2) Slashing
 * damage.` — so the to-hit, the reach, the average, the dice and the damage type are all
 * printed, and none of them has to be inferred. `_Constitution Saving Throw:_ DC 13` is the
 * other shape.
 *
 * ⚠️ **The dice expression is taken verbatim and normalised for spacing only.** `2d8 + 7`
 * in the SRD is `2d8+7` in this application, because `ROLL_PATTERN` is strict about it —
 * that is a formatting difference, not a content decision, and it is made here so no
 * downstream consumer has to remember.
 */
function parseAction(entry) {
  // ⚠️ **No underscores in these patterns, and that is not a simplification.** `entry.text`
  // has already been through `stripEmphasis`, so the SRD's `_Melee Attack Roll:_` reaches
  // here as `Melee Attack Roll:`. A pattern written against the raw markdown matches
  // nothing and reports every creature as having no attack bonus — silently, because a
  // missing to-hit is a legal shape for a trait.
  const attack = /(Melee|Ranged|Melee or Ranged) Attack Roll:\s*([+−-]?\d+)/.exec(entry.text)
  const saveDc = /([A-Za-z]+) Saving Throw:\s*DC\s*(\d+)/.exec(entry.text)
  const range = /(?:reach|range)\s+([\d/]+\s*(?:ft\.|feet))/i.exec(entry.text)

  // `7 (1d10 + 2) Slashing damage` — the parenthesised expression, plus the word after the
  // closing bracket, which is the damage type.
  const damage = /(\d+)\s*\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)\s*([A-Za-z]+)\s+damage/.exec(entry.text)
  // A flat-damage action — `takes 3 Poison damage` — has no dice at all.
  const flat = damage ? null : /(\d+)\s+([A-Za-z]+)\s+damage/.exec(entry.text)

  return {
    toHit: attack ? num(attack[2]) : null,
    saveDc: saveDc ? Number(saveDc[2]) : null,
    saveAbility: saveDc ? saveDc[1].toLowerCase() : null,
    range: range ? range[1].replace(/\s+/g, ' ').trim() : null,
    melee: attack ? attack[1].startsWith('Melee') : false,
    average: damage ? Number(damage[1]) : flat ? Number(flat[1]) : null,
    dice: damage ? damage[2].replace(/\s+/g, '') : null,
    damageType: damage ? damage[3].toLowerCase() : flat ? flat[2].toLowerCase() : null,
  }
}

/** `Perception +5, Stealth +7` → `[{ skill: 'perception', bonus: 5 }, …]`. */
function parseSkills(line) {
  if (!line) return []
  return [...line.matchAll(/([A-Z][A-Za-z ]*?)\s*([+−-]\d+)/g)].map((m) => ({
    skill: m[1].trim(),
    bonus: num(m[2]),
  }))
}

/**
 * One stat block, parsed. Returns null for a heading that is not one — the group headings
 * in `monsters-A-Z.md` and the front matter in both files.
 */
function parseBlock(name, body, origin) {
  const cr = /\*\*CR\*\*\s*([\d/]+)/.exec(body)
  const ac = /\*\*AC\*\*\s*(\d+)/.exec(body)
  const hp = /\*\*HP\*\*\s*(\d+)(?:\s*\(([^)]*)\))?/.exec(body)
  if (!cr || !ac || !hp) return null

  const scores = parseAbilityTable(body)
  if (!scores) return null

  // `_Large Aberration, Lawful Evil_` on the line after the heading. The size may be a
  // choice — `Medium or Small Humanoid` — in which case the first is taken, because a token
  // has one footprint and the SRD lists the larger first.
  const line = /^\s*_([^_]+)_\s*$/m.exec(body)
  const descriptor = line ? line[1] : ''
  const [typePart, alignPart] = descriptor.split(/,\s*/)
  const sizeMatch = /^(Tiny|Small|Medium|Large|Huge|Gargantuan)/.exec(typePart ?? '')

  const initiative = /\*\*Initiative\*\*\s*([+−-]?\d+)/.exec(body)
  const speed = /\*\*Speed\*\*\s*([^\n]*)/.exec(body)
  const senses = /\*\*Senses\*\*\s*([^\n]*)/.exec(body)
  const skills = /\*\*Skills\*\*\s*([^\n]*)/.exec(body)
  const gear = /\*\*Gear\*\*\s*([^\n]*)/.exec(body)
  const languages = /\*\*Languages\*\*\s*([^\n]*)/.exec(body)
  const passive = senses ? /Passive Perception\s*(\d+)/.exec(senses[1]) : null
  const walk = speed ? /^(\d+)\s*ft/.exec(speed[1].trim()) : null

  // Sections, split at the `####`/`###` headings inside the block. Each is a list of
  // `**_Name._**` entries.
  const sections = {}
  const headings = [...body.matchAll(/^#{3,4}\s+(Traits|Actions|Bonus Actions|Reactions|Legendary Actions)\s*$/gm)]
  headings.forEach((heading, index) => {
    const start = heading.index + heading[0].length
    const end = index + 1 < headings.length ? headings[index + 1].index : body.length
    sections[heading[1]] = parseEntries(body.slice(start, end))
  })

  const actions = (sections['Actions'] ?? []).map((entry) => ({ ...entry, ...parseAction(entry) }))
  const bonus = (sections['Bonus Actions'] ?? []).map((entry) => ({ ...entry, ...parseAction(entry) }))
  const traits = (sections['Traits'] ?? []).map((entry) => ({ ...entry, ...parseAction(entry) }))
  const reactions = (sections['Reactions'] ?? []).map((entry) => ({ ...entry, ...parseAction(entry) }))
  const legendary = (sections['Legendary Actions'] ?? []).map((entry) => ({
    ...entry,
    ...parseAction(entry),
  }))

  return {
    origin,
    name,
    cr: parseCr(cr[1]),
    armourClass: Number(ac[1]),
    maxHp: Number(hp[1]),
    hitDice: hp[2] ? hp[2].replace(/\s+/g, '') : null,
    size: sizeMatch ? sizeMatch[1].toLowerCase() : 'medium',
    // `Large Aberration` → `Aberration`; `Large Beast (Dinosaur)` → `Beast (Dinosaur)`.
    creatureType: (typePart ?? '').replace(/^(Tiny|Small|Medium|Large|Huge|Gargantuan)(\s+or\s+\w+)?\s*/, '').trim(),
    alignment: (alignPart ?? 'Unaligned').trim(),
    initiativeBonus: initiative ? num(initiative[1]) : 0,
    speed: walk ? Number(walk[1]) : 0,
    speedText: speed ? stripTags(speed[1]) : '',
    passivePerception: passive ? Number(passive[1]) : null,
    abilities: scores.abilities,
    saves: scores.saves,
    skills: parseSkills(skills ? skills[1] : null),
    gear: gear ? stripTags(gear[1]) : '',
    languages: languages ? stripTags(languages[1]) : '',
    sensesText: senses ? stripTags(senses[1]) : '',
    traits,
    actions,
    bonusActions: bonus,
    reactions,
    legendaryActions: legendary,
  }
}

/**
 * Every stat block in the two SRD files, in document order.
 *
 * `root` is the directory holding the SRD markdown. Nothing is written and nothing is
 * cached — the pipeline is fast enough to run from source every time, which is the property
 * that keeps a stale intermediate from being mistaken for the SRD.
 */
export function readCreatures(root) {
  const out = []
  for (const { file, depth, origin } of SOURCES) {
    const text = readFileSync(join(root, file), 'utf8')
    const marker = new RegExp(`^#{${depth}} (?!#)(.+)$`, 'gm')
    const headings = [...text.matchAll(marker)]
    headings.forEach((heading, index) => {
      const start = heading.index + heading[0].length
      const end = index + 1 < headings.length ? headings[index + 1].index : text.length
      const parsed = parseBlock(heading[1].trim(), text.slice(start, end), origin)
      if (parsed) out.push(parsed)
    })
  }
  return out
}
