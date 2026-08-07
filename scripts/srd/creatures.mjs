#!/usr/bin/env node
// Generating `convex/lib/bestiary/`'s four transcribed content files from the D&D 5e (2024)
// SRD 5.2.1.
//
//     node scripts/srd/creatures.mjs <path-to-srd>          # writes the content files
//     SRD_PATH=… node scripts/srd/creatures.mjs             # same, from the environment
//     node scripts/srd/creatures.mjs <path> --check         # prints the report, writes nothing
//
// ⚠️ **The SRD is never copied into this repository and this script never puts it there.**
// It reads a clone that lives outside the tree and emits TypeScript; the TypeScript is what
// is committed. That is the whole reason a generator exists rather than a one-off paste: the
// source stays where its licence and its size belong, and the derived corpus is reviewable
// in a diff.
//
// ⚠️ **GENERATE, THEN REVIEW.** The output of this script is not the corpus — it is a first
// draft of the corpus that a person then reads. Nothing here is run in CI, nothing imports
// it, and re-running it after a hand edit to a content file would silently discard the edit.
// The generated files say so at the top of each of them.
//
// **`social.ts` is deliberately absent from the output.** Its thirty NPCs have no SRD source
// — the SRD has no innkeeper — so they are the one part of the corpus that is *authored*
// rather than transcribed, and a generator that rewrote them would be inventing a provenance
// they do not have. See the note at the top of that file.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { readCreatures } from './parse.mjs'
import {
  KEY_ALIASES,
  KEY_OVERRIDES,
  abilityFallback,
  attackText,
  blurbOf,
  environmentOf,
  isEnemy,
  kebab,
  lootOf,
  notesOf,
  roleOf,
  tagsOf,
} from './vocabulary.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, '..', '..', 'convex', 'lib', 'bestiary')

/** The ten ratings this application has, which is also the slice of the SRD it transcribes. */
const CR_VALUES = [0, 0.125, 0.25, 0.5, 1, 2, 3, 4, 5, 6]

/**
 * The benchmark table, **duplicated here on purpose and checked against the real one**.
 *
 * The generator needs a row to measure a creature's deviation against — that is what decides
 * its role — and `convex/lib/bestiary/benchmarks.ts` is TypeScript this plain-`.mjs` script
 * cannot import. Two copies of a table is exactly the drift this codebase keeps correcting,
 * so the copy is not left to trust: `--check` re-reads the real file and refuses to run if
 * the two disagree, which turns "somebody tuned the table and forgot the generator" from a
 * silently wrong corpus into a failed run.
 */
const ROWS = {
  0: { hp: 4, armourClass: 11, attackBonus: 3, damage: 2, saveDc: 11, skillBonus: 3 },
  0.125: { hp: 9, armourClass: 12, attackBonus: 4, damage: 4, saveDc: 11, skillBonus: 4 },
  0.25: { hp: 14, armourClass: 12, attackBonus: 4, damage: 6, saveDc: 11, skillBonus: 4 },
  0.5: { hp: 21, armourClass: 12, attackBonus: 4, damage: 7, saveDc: 11, skillBonus: 4 },
  1: { hp: 28, armourClass: 13, attackBonus: 5, damage: 10, saveDc: 11, skillBonus: 4 },
  2: { hp: 45, armourClass: 13, attackBonus: 5, damage: 13, saveDc: 12, skillBonus: 4 },
  3: { hp: 64, armourClass: 14, attackBonus: 5, damage: 17, saveDc: 12, skillBonus: 4 },
  4: { hp: 79, armourClass: 15, attackBonus: 6, damage: 20, saveDc: 13, skillBonus: 5 },
  5: { hp: 103, armourClass: 15, attackBonus: 7, damage: 28, saveDc: 14, skillBonus: 5 },
  6: { hp: 120, armourClass: 16, attackBonus: 7, damage: 33, saveDc: 15, skillBonus: 6 },
}

/** `tierOf` in convex/lib/creatures.ts, in the one form this script can reach. */
function tierOf(cr) {
  if (cr <= 0.25) return 1
  if (cr <= 1) return 2
  if (cr <= 3) return 3
  if (cr <= 5) return 4
  return 5
}

/** The party a tier is aimed at, as the two stored fields. */
const TIER_PARTY = {
  1: [1, 2],
  2: [1, 3],
  3: [2, 4],
  4: [3, 5],
  5: [4, 5],
}

/** The eighteen skill keys, by the name the SRD prints. */
const SKILL_KEYS = {
  Athletics: 'athletics',
  Acrobatics: 'acrobatics',
  'Sleight of Hand': 'sleightOfHand',
  Stealth: 'stealth',
  Arcana: 'arcana',
  Investigation: 'investigation',
  History: 'history',
  Nature: 'nature',
  Religion: 'religion',
  'Animal Handling': 'animalHandling',
  Insight: 'insight',
  Perception: 'perception',
  Medicine: 'medicine',
  Survival: 'survival',
  Deception: 'deception',
  Intimidation: 'intimidation',
  Performance: 'performance',
  Persuasion: 'persuasion',
}

const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }

/**
 * The attacks a creature actually makes in a turn, in the order it makes them.
 *
 * ⚠️ **Multiattack is expanded rather than stored**, and this is the one place the
 * transcription reshapes the SRD rather than copying it. A dragon whose Multiattack reads
 * *"makes two Rend attacks"* is stored as two Rend lines, because `bestiary.test.ts`
 * measures a creature's output as the **sum over every attack listed** and a DM clicks the
 * line once per swing. Storing Rend once would halve the dragon on the sheet, on the
 * benchmark and in the feed at the same time — and the corpus already carried this
 * convention before the conversion, in the Brown Bear and the Goblin Boss.
 *
 * Only the **first** branch of an either/or routine is taken. *"…or it makes two Hurl Flame
 * attacks"* is a choice the DM makes at the table, not a second thing that happens, and
 * counting both would double the creature.
 *
 * Capped at three, which is `BestiaryAttack`'s own cap. Four creatures in range exceed it
 * and three of those only by the or-branch this already drops.
 */
function routineOf(creature) {
  // ⚠️ `a.average !== null` as well as `a.dice`, because sixteen creatures at the bottom of
  // the corpus deal a printed flat `1` with no dice at all. Filtering on the dice alone
  // dropped every one of them, and the failure was silent: a Rat with no attack is a
  // well-formed entry that simply never appears in the damage sweep.
  const attacks = creature.actions.filter((a) => a.toHit !== null && (a.dice || a.average !== null))
  if (attacks.length === 0) return []
  const multi = creature.actions.find((a) => /^Multiattack/i.test(a.name))
  if (!multi) return [attacks[0]]

  const first = multi.text.split(/,?\s+or\s+it\s+/i)[0]
  const named = [...first.matchAll(/\b(one|two|three|four|five|six)\s+([A-Z][A-Za-z' ]*?)\s+attacks?\b/g)]
  const out = []
  if (named.length > 0) {
    for (const match of named) {
      const found = attacks.find((a) => a.name.toLowerCase() === match[2].trim().toLowerCase())
      if (!found) continue
      for (let i = 0; i < WORDS[match[1].toLowerCase()]; i += 1) out.push(found)
    }
  } else {
    const bare = /makes\s+(one|two|three|four|five|six)\s+attacks/i.exec(first)
    const count = bare ? WORDS[bare[1].toLowerCase()] : 1
    for (let i = 0; i < count; i += 1) out.push(attacks[0])
  }
  return (out.length > 0 ? out : [attacks[0]]).slice(0, 3)
}

/** `count × (faces + 1) / 2 + modifier`, which is what the benchmark table's `damage` means. */
function averageOf(dice) {
  const match = /^(\d+)d(\d+)([+-]\d+)?$/.exec(dice ?? '')
  if (!match) return 0
  return (Number(match[1]) * (Number(match[2]) + 1)) / 2 + (match[3] ? Number(match[3]) : 0)
}

/**
 * An SRD damage expression in this application's roll grammar.
 *
 * ⚠️ **Two rewrites, and only two.**
 *
 *   - **Spaces go.** `2d8 + 7` in the SRD is `2d8+7` here, because `ROLL_PATTERN` is strict
 *     about it. A formatting difference, not a content decision.
 *   - **A flat 1 and a `1d4-1` both become `1d2`.** Fourteen CR 0 creatures deal a printed
 *     `1` with no dice at all, which is not a roll and cannot be stored as one; two more
 *     deal `1d4 - 1`, which averages exactly what `1d2` does. Rounding both up to `1d4`
 *     would inflate the weakest creatures in the corpus by two thirds at the one rating
 *     where `hp[0]` and `damage[0]` make every deviation loudest. `d2` is legal in the
 *     shared grammar since the board-polishing milestone widened it, and this is its first
 *     use in stored content.
 */
function rollOf(dice, average) {
  if (!dice) return average !== null && average <= 1 ? '1d2' : null
  const tidy = dice.replace(/\s+/g, '')
  if (tidy === '1d4-1') return '1d2'
  return tidy
}

/**
 * What a line in an expanded routine is called. `Rend`, then `Second Rend`, `Third Rend`.
 *
 * ⚠️ **TWO ATTACKS ON ONE CREATURE MAY NOT SHARE A NAME, AND THIS IS NOT A STYLE RULE.**
 * `entryId` in lib/resolve.ts mints a sheet entry's id as `atk:` plus a slug of its *name*
 * and deliberately ignores the index — so that a challenge-rating shift, which rewrites the
 * damage on every attack, does not renumber the list and make React read it as wholly
 * replaced. Two lines called `Rend` therefore both become `atk:rend`, `sheetProblem` refuses
 * the sheet with *"Two entries on this sheet share an id"*, and the creature does not
 * resolve at any rating at all.
 *
 * That was found by generating the corpus rather than by reading the code: eighty-six
 * creatures with a repeating Multiattack failed at all ten ratings at once. Numbering the
 * repeats is what keeps `routineOf`'s expansion — which is what makes a two-Rend dragon read
 * as a two-Rend dragon on the benchmark and in the feed — expressible at all.
 *
 * It also happens to be the better sheet: a DM looking at `Rend` and `Second Rend` can see
 * that the creature attacks twice, which the SRD only says in a paragraph of prose.
 */
const ORDINALS = ['', 'Second ', 'Third ']

function attackName(attack, routine, index) {
  const bare = attack.name.replace(/\s*\(.*\)$/, '').trim()
  const repeat = routine.slice(0, index).filter((other) => other === attack).length
  return `${ORDINALS[repeat] ?? `${repeat + 1}× `}${bare}`
}

/** `melee` / `60/120 ft.` / `30 ft.` — what the sheet prints beside an attack. */
function rangeOf(attack) {
  if (attack.melee) return 'melee'
  return attack.range ?? 'ranged'
}

/**
 * The up-to-three abilities kept from a stat block that may print seven.
 *
 * Ordered by what a DM needs to know first, and the first rule is not taste: **an ability
 * that rolls damage is kept ahead of one that does not**, because `scalesWithCr` only means
 * anything on an ability with a roll, and a dragon whose breath was dropped for a trait
 * about breathing water is a dragon that scales wrong.
 */
function abilitiesOf(creature) {
  const candidates = [
    ...creature.traits,
    ...creature.bonusActions,
    ...creature.reactions,
    // A non-attack action — a breath weapon, a gaze, a wail. Legendary actions are excluded
    // deliberately: they are a turn-structure feature this application does not model, and
    // a line describing one would promise something the table cannot do.
    ...creature.actions.filter((a) => a.toHit === null && !/^Multiattack/i.test(a.name)),
  ]
  const ranked = candidates
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const damaging = (x) => (x.entry.dice ? 0 : x.entry.saveDc !== null ? 1 : 2)
      return damaging(a) - damaging(b) || a.index - b.index
    })
  const seen = new Set()
  const out = []
  for (const { entry } of ranked) {
    const name = entry.name.replace(/\s*\(.*\)$/, '').trim()
    if (name === '' || seen.has(name)) continue
    seen.add(name)
    out.push({ ...entry, name })
    if (out.length === 3) break
  }
  return out
}

/** Every save DC printed anywhere on the block, or null for a creature that forces none. */
function saveDcOf(creature) {
  const all = [...creature.actions, ...creature.traits, ...creature.bonusActions, ...creature.reactions]
    .map((a) => a.saveDc)
    .filter((dc) => dc !== null)
  return all.length > 0 ? Math.max(...all) : null
}

/** The proficiency bonus a challenge rating carries, which the SRD prints on the CR line. */
function proficiencyBonus(cr) {
  if (cr < 5) return 2
  return 3
}

function abilityModifier(score) {
  return Math.floor((score - 10) / 2)
}

/**
 * One number for the whole creature, which is `npcSheetValidator`'s deliberate reduction.
 *
 * The **highest** printed to-hit, not the mean and not the first. A DM clicking an attack
 * expects the creature's good arm, and understating it makes every attack in the corpus miss
 * more often than the SRD says it should. A creature the SRD gives no attack roll at all —
 * there are two — falls back to the derivation the SRD itself uses, best physical modifier
 * plus proficiency, rather than to a row value it has not earned.
 */
function attackBonusOf(creature) {
  const printed = creature.actions.filter((a) => a.toHit !== null).map((a) => a.toHit)
  if (printed.length > 0) return Math.max(...printed)
  const physical = Math.max(abilityModifier(creature.abilities.str), abilityModifier(creature.abilities.dex))
  return physical + proficiencyBonus(creature.cr)
}

/** Up to six skills, in the order the SRD prints them, dropping any this application lacks. */
function skillsOf(creature) {
  const out = []
  const seen = new Set()
  for (const { skill, bonus } of creature.skills) {
    const key = SKILL_KEYS[skill]
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push({ key, bonus })
    if (out.length === 6) break
  }
  return out
}

/** Which of today's 129 keys this SRD block answers to, or its own kebab-cased name. */
function keyOf(creature, aliasByName) {
  return aliasByName.get(creature.name) ?? KEY_OVERRIDES[creature.name] ?? kebab(creature.name)
}

// ---------------------------------------------------------------------------
// Building an entry
// ---------------------------------------------------------------------------

function buildEntry(creature, aliasByName) {
  const row = ROWS[creature.cr]
  const routine = routineOf(creature)
  const damage = routine.reduce((sum, a) => sum + averageOf(rollOf(a.dice, a.average)), 0)
  const role = roleOf(creature, row, damage)
  const environmentTags = environmentOf(creature)
  const tags = tagsOf(creature, role, environmentTags)
  const tier = tierOf(creature.cr)
  const [min, max] = TIER_PARTY[tier]

  const attacks = routine.map((attack, index) => ({
    name: attackName(attack, routine, index),
    damage: rollOf(attack.dice, attack.average),
    damageType: attack.damageType ?? 'bludgeoning',
    range: rangeOf(attack),
    text: attackText(creature, attack),
  }))

  const abilities = abilitiesOf(creature).map((entry) => {
    const roll = entry.dice ? rollOf(entry.dice, entry.average) : null
    const average = roll ? averageOf(roll) : 0
    return {
      name: entry.name,
      text: abilityFallback(creature, entry),
      roll,
      // The dragon-breath rule, applied by the same test that enforces it: an ability
      // carrying more than its own row's whole damage figure must move when the creature
      // does, or a CR 6 breath weapon survives a step down to CR 2 intact.
      ...(roll !== null && average > row.damage ? { scalesWithCr: true } : {}),
    }
  })

  return {
    key: keyOf(creature, aliasByName),
    name: creature.name,
    creatureType: creature.creatureType || 'Monstrosity',
    size: creature.size,
    alignment: creature.alignment || 'Unaligned',
    role,
    tags,
    cr: creature.cr,
    tier,
    recommendedPartyLevelMin: min,
    recommendedPartyLevelMax: max,
    environmentTags,
    combat: {
      maxHp: creature.maxHp,
      armourClass: creature.armourClass,
      attackBonus: attackBonusOf(creature),
      initiativeBonus: creature.initiativeBonus,
      passivePerception: creature.passivePerception,
      speed: creature.speed,
      saveDc: saveDcOf(creature),
      abilities: creature.abilities,
      saves: creature.saves,
      skills: skillsOf(creature),
      attacks,
      abilities_: abilities,
    },
    loot: lootOf(creature),
    notes: notesOf(creature, role, environmentTags),
    blurb: blurbOf(creature, role),
  }
}

// ---------------------------------------------------------------------------
// Emitting TypeScript
// ---------------------------------------------------------------------------

/** A TypeScript string literal. Single-quoted, with the two characters that need escaping. */
function str(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

function emitAttack(attack) {
  return `          {
            name: ${str(attack.name)},
            damage: ${str(attack.damage)},
            damageType: ${str(attack.damageType)},
            range: ${str(attack.range)},
            text: ${str(attack.text)},
          },`
}

function emitAbility(ability) {
  const scales = ability.scalesWithCr === true ? '\n            scalesWithCr: true,' : ''
  return `          {
            name: ${str(ability.name)},
            text: ${str(ability.text)},
            roll: ${ability.roll === null ? 'null' : str(ability.roll)},${scales}
          },`
}

/** A list of already-emitted lines, or a bare `[]` — never `[` followed by a blank line. */
function emitList(lines) {
  return lines.length === 0 ? '[],' : `[\n${lines.join('\n')}\n        ],`
}

function emitEntry(entry) {
  const c = entry.combat
  const scores = ['str', 'dex', 'con', 'int', 'wis', 'cha']
  return `    {
      key: ${str(entry.key)},
      name: ${str(entry.name)},
      creatureType: ${str(entry.creatureType)},
      size: ${str(entry.size)},
      alignment: ${str(entry.alignment)},
      role: ${str(entry.role)},
      tags: [${entry.tags.map(str).join(', ')}],
      cr: ${entry.cr},
      tier: ${entry.tier},
      recommendedPartyLevelMin: ${entry.recommendedPartyLevelMin},
      recommendedPartyLevelMax: ${entry.recommendedPartyLevelMax},
      environmentTags: [${entry.environmentTags.map(str).join(', ')}],
      combat: {
        maxHp: ${c.maxHp},
        armourClass: ${c.armourClass},
        attackBonus: ${c.attackBonus},
        initiativeBonus: ${c.initiativeBonus},
        passivePerception: ${c.passivePerception === null ? 'null' : c.passivePerception},
        speed: ${c.speed},
        saveDc: ${c.saveDc === null ? 'null' : c.saveDc},
        abilityScores: { ${scores.map((k) => `${k}: ${c.abilities[k]}`).join(', ')} },
        saveBonuses: { ${scores.map((k) => `${k}: ${c.saves[k]}`).join(', ')} },
        skills: [${c.skills.map((s) => `{ key: ${str(s.key)}, bonus: ${s.bonus} }`).join(', ')}],
        attacks: ${emitList(c.attacks.map(emitAttack))}
        abilities: ${emitList(c.abilities_.map(emitAbility))}
      },
      loot: ${str(entry.loot)},
      notes: ${str(entry.notes)},
      blurb: ${str(entry.blurb)},
    },`
}

function emitFile({ constant, category, header, entries }) {
  return `${header}
import type { BestiaryFile } from './types'

export const ${constant}: BestiaryFile = {
  category: ${str(category)},
  entries: [
${entries.map(emitEntry).join('\n')}
  ],
}
`
}

const BANNER = `// ⚠️ GENERATED BY scripts/srd/creatures.mjs FROM THE D&D 5e (2024) SRD 5.2.1.
//
// **Generated, then reviewed — not generated on every build.** Nothing imports the
// generator, no CI step runs it, and re-running it discards any hand edit made to this file
// since. Treat it as a first draft that was read: fix a number here, and record the fix in
// the generator too if it is the kind of mistake it would make again.
//
// ⚠️ **These entries are linked, not copied.** A character assigned a creature stores its
// \`key\` and reads this file through the resolver, so editing an entry below changes that
// creature in every game that already links to it — including games in progress. Rename
// nothing: a retired key falls into \`resolveBestiary\`'s first branch and the creature loses
// its hit points, its armour class, its attacks and its labels at once. Every key this
// corpus has ever published is accounted for in ./retired.ts.
//
// ⚠️ **THE NUMBERS ARE TRANSCRIBED AND THE PROSE IS AUTHORED.** Armour class, hit points,
// speed, the six ability scores, the six saving-throw bonuses, the skill bonuses, passive
// perception, initiative, the damage dice, the attack bonus and the save DC are read off the
// SRD's own printed stat block. Every sentence — an attack's \`text\`, an ability's \`text\`,
// \`notes\`, \`blurb\` and \`loot\` — is written by the phrase banks in
// scripts/srd/vocabulary.mjs, because SRD action text is made of dice notation and to-hit
// numbers, and \`bestiary.test.ts\` sweeps this corpus for both: a challenge-rating shift
// changes numbers and cannot change words, so a sentence naming a die goes stale the first
// time somebody uses the stepper.
//
// Prose rule that catches everybody: **no dice and no to-hit numbers in any description**,
// and none of requirements.md's movement-impairing vocabulary either.`

function header(title, body) {
  return `// ${title}
//
${body
  .split('\n')
  .map((line) => `// ${line}`.trimEnd())
  .join('\n')}
//
${BANNER}
`
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2)
  const check = args.includes('--check')
  const root = args.find((arg) => !arg.startsWith('--')) ?? process.env.SRD_PATH
  if (!root) {
    console.error('usage: node scripts/srd/creatures.mjs <path-to-srd-clone> [--check]')
    console.error('   or: SRD_PATH=<path> node scripts/srd/creatures.mjs')
    process.exit(2)
  }

  const all = readCreatures(root).filter((creature) => CR_VALUES.includes(creature.cr))
  const aliasByName = new Map(Object.entries(KEY_ALIASES).map(([key, name]) => [name, key]))

  const entries = all.map((creature) => buildEntry(creature, aliasByName))
  const enemies = entries.filter((_, i) => isEnemy(all[i]))
  const monsters = entries.filter((_, i) => !isEnemy(all[i]))

  const byTier = (tiers) => monsters.filter((entry) => tiers.includes(entry.tier))
  const low = byTier([1, 2])
  const mid = byTier([3])
  const high = byTier([4, 5])

  const files = [
    {
      path: 'monstersLow.ts',
      constant: 'MONSTERS_LOW',
      category: 'monster',
      entries: low,
      header: header(
        'Monsters, Tier I and Tier II — everything a level 1 to level 3 party meets.',
        `Content only; the shape is in ./types.ts, and the note at the top of that file explains
why nothing here may ever be reached from the browser.

Two constraints bite hardest at this end of the corpus and are worth stating before anybody
edits a number:

  - **A challenge rating of 0 gets one die.** The bottom benchmark row is the largest
    amplifier in the table — every scale from CR 0 divides by \`hp: 4\` and \`damage: 2\` — so
    a second attack down here becomes a second attack's worth of everything at CR 6.
  - **Damage is summed over every attack listed**, not taken per attack, which is why a
    creature whose Multiattack makes two Rend attacks is stored with two Rend lines.`,
      ),
    },
    {
      path: 'monstersMid.ts',
      constant: 'MONSTERS_MID',
      category: 'monster',
      entries: mid,
      header: header(
        'Monsters, Tier III — challenge rating 2 and 3, for a party around level 3.',
        `Content only; the shape is in ./types.ts. The middle of the corpus and the widest tier:
this is where a DM shops for a session's main fight.`,
      ),
    },
    {
      path: 'monstersHigh.ts',
      constant: 'MONSTERS_HIGH',
      category: 'monster',
      entries: high,
      header: header(
        'Monsters, Tier IV and Tier V — challenge rating 4 to 6, the top of this application.',
        `Content only; the shape is in ./types.ts.

⚠️ **A solo CR 6 creature read straight off the benchmark row dies in a round and a half**
against a level 5 party, and that is intended. The uplift for a set-piece comes from the
creature's own deviation above its row, never from inflating \`hp[6]\` — which is shared, so
raising it inflates every CR 6 mook standing next to the boss.`,
      ),
    },
    {
      path: 'enemies.ts',
      constant: 'ENEMIES',
      category: 'enemy',
      entries: enemies,
      header: header(
        'People who fight — the humanoid enemies tab.',
        `Content only; the shape is in ./types.ts.

⚠️ **\`BestiaryFile.category\` has no SRD counterpart.** The SRD publishes one flat
alphabetical list; this split into monsters, enemies and people is a local organising choice
that survives the conversion because a DM choosing at speed does not want a goblin filed
between a gnoll and a gorgon.

The goblinoids are here rather than under monsters on purpose. 2024 moved goblins,
hobgoblins and bugbears from Humanoid to **Fey**, which is a change to their lore and not to
what a party is fighting.`,
      ),
    },
  ]

  report(all, entries, { low, mid, high, enemies })

  if (check) {
    console.log('\n--check: nothing written.')
    return
  }
  mkdirSync(OUT, { recursive: true })
  for (const file of files) {
    writeFileSync(join(OUT, file.path), emitFile(file), 'utf8')
    console.log(`wrote ${file.path} (${file.entries.length} entries)`)
  }
}

/** What the run found, printed so the review that follows it has somewhere to start. */
function report(all, entries, split) {
  console.log(`read ${all.length} stat blocks at CR 0-6`)
  console.log(
    `  monstersLow ${split.low.length} · monstersMid ${split.mid.length} · monstersHigh ${split.high.length} · enemies ${split.enemies.length}`,
  )

  const counts = {}
  for (const entry of entries) counts[entry.role] = (counts[entry.role] ?? 0) + 1
  console.log('  roles:', JSON.stringify(counts))

  const keys = entries.map((entry) => entry.key)
  const repeated = keys.filter((key, i) => keys.indexOf(key) !== i)
  if (repeated.length > 0) console.log('  ⚠️ DUPLICATE KEYS:', repeated.join(', '))

  const noAttack = entries.filter((entry) => entry.combat.attacks.length === 0)
  if (noAttack.length > 0) console.log('  no attack:', noAttack.map((e) => e.key).join(', '))

  const skills = Math.max(...entries.map((entry) => entry.combat.skills.length))
  const attacks = Math.max(...entries.map((entry) => entry.combat.attacks.length))
  const abilities = Math.max(...entries.map((entry) => entry.combat.abilities_.length))
  console.log(`  caps reached: skills ${skills} · attacks ${attacks} · abilities ${abilities}`)

  // ⚠️ The retirement list, which is the whole reason `KEY_ALIASES` exists. Printed on every
  // run rather than only on a mismatch, because a key that quietly stopped resolving is a
  // creature that quietly lost its statline in somebody's live game.
  if (process.env.PREVIOUS_KEYS) {
    const previous = process.env.PREVIOUS_KEYS.split(/[\s,]+/).filter(Boolean)
    const held = new Set(entries.map((entry) => entry.key))
    const lost = previous.filter((key) => !held.has(key))
    console.log(`  keys carried over: ${previous.length - lost.length}/${previous.length}`)
    console.log(`  RETIRED (${lost.length}): ${lost.join(' ')}`)
  }
}

main()
