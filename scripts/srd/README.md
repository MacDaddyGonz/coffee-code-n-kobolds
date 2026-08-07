# `scripts/srd/` — a build-time source, not a shipped document

Everything in this directory reads the **5e (2024) SRD 5.2.1** and prints TypeScript. Nothing here
is imported by the application, bundled into the browser, or deployed to Convex. It exists so that
the largest content job in the project's history could be *scaffolded and reviewed* rather than
typed, and so that the next person to re-derive a corpus can see exactly how the last one was
derived.

## The source is outside this repository, on purpose

The SRD checkout lives wherever you cloned it —
[`downfallx/dnd-5e-srd-markdown`](https://github.com/downfallx/dnd-5e-srd-markdown), branch
`master` — and **no SRD file is ever copied in here**. Each script takes the path as an argument,
falls back to an environment variable, and then to a default:

```bash
node scripts/srd/spells.mjs                          # the default path
node scripts/srd/spells.mjs /elsewhere/spells.md     # an argument
SRD_SPELLS=/elsewhere/spells.md node scripts/srd/spells.mjs
```

There is deliberately no path inside the tree it could default to. A vendored copy is a second
source of truth that drifts silently, and the repository is public — the corpora it ships are
paraphrases written by hand, and a checked-in `spells.md` would quietly make that untrue.

🚫 **[`sycarion/5e-2024-SRD`](https://github.com/sycarion/5e-2024-SRD) must not be used.** Despite
the name it is the 2014 SRD 5.1; `docs/roadmap.md` records the rejection with the evidence. Pointing
one of these scripts at it converts the application to the previous edition one file at a time.

## Why `scripts/` and not `convex/` or `src/`

Two guard tests decide where a module reading a corpus is allowed to live, and both are keyed on the
**path**:

| Guard | What it sweeps | Needle |
| --- | --- | --- |
| `convex/bundleGuard.test.ts` | every file under `src/` | a quoted specifier naming `convex/lib/(library\|resolve\|bestiary\|dice\|feed)`, **or anything under `scripts/`** |
| `convex/corpusGuard.test.ts` | every file under `convex/` | a quoted specifier naming `library` or `bestiary` as a path segment |

A module in `scripts/srd/` is outside both by construction: it is not under `src/`, so the first
sweep does not read it, and it is not under `convex/`, so the second does not either. That is the
whole reason for the location — **the generator can read whatever it likes because nothing can
reach it**, and the one new surface it creates is closed by the `scripts/` half of the first
needle, which was added in the same commit that added this directory.

⚠️ **Plain `.mjs` on purpose**, the same choice `scripts/board-smoke.mjs` makes and for the same
reason: no `tsx`, no new dependency, nothing to install. It also means these scripts *cannot* import
a `.ts` module even by accident, which is a second lock on the same door.

## What a generator does and does not do

`spells.mjs` derives the facts that are **mechanical** — the spell's level, its category, its dice,
its casting time, its duration, and which ability the commonest caster of it uses — and assembles a
scaffold entry with a placeholder for the prose.

**The prose in `convex/lib/rules.ts` is written by hand over the top of that**, and this is the part
that is easy to get wrong on a second pass. Two reasons it has to be:

- `MAX_ENTRY_TEXT_LENGTH` is 600 and SRD spell prose routinely runs past it. Paraphrasing is what
  keeps the cap where it is rather than raising a bound on every sheet in every game.
- The corpus promises a paraphrase for a DM reading it at the table rather than SRD text, and that
  promise is what keeps the shipped bundle free of SRD prose.

So **re-running a generator is not a refresh.** It emits a fresh scaffold to diff against, and the
diff is what tells you which spells the source changed. It cannot regenerate `rules.ts`, because
the sentences there are not in the source.

⚠️ Each script carries a copy of `ROLL_PATTERN` rather than importing it, because it may not reach
into `convex/`. The copy is kept honest by `convex/lib/rules.test.ts`, which runs the *real*
`isValidRoll` over every committed entry — so a scaffold that emitted a roll the grammar refuses
fails there rather than shipping.

## What each script prints

`stdout` is the TypeScript block and nothing else, so it can be redirected. `stderr` carries the
counts and the warnings, which are what a reviewer should read first:

```
parsed 339 spells; by level: {"0":27,"1":57,"2":57,"3":42, …}
in range (level <= 3): 183
categories: {"weapon":18,"action":47,"passive":118}
```

⚠️ **A count that disagrees with the milestone's is the finding, not a nuisance.** The roadmap said
15 cantrips; the source has 27, and that number is what the corpus was built to.

## What was corrected by hand after the first run

The scaffold got 177 of the 183 spells' mechanical fields right and six wrong, and they are listed
so that a re-run's diff can be read without rediscovering all six. Everything else is byte-identical
between `spells.mjs`' output and what is committed.

| Spell | Scaffold said | Committed | Why |
| --- | --- | --- | --- |
| Alter Self | `action`, `1d6+INT` | `passive`, `null` | The 1d6 belongs to one of three options, and the spell is a shape you declare. The dice are in the prose |
| Meld into Stone | `action`, `6d6` | `passive`, `null` | The 6d6 is what happens if the *stone* is destroyed, not what the spell does |
| Web | `action`, `2d4` | `passive`, `null` | The 2d4 is the strands burning away, not the effect anybody casts it for |
| False Life | `2d4` | `2d4+4` | The SRD writes `2d4 + 4`, and "the first `NdM`" cannot see the `+ 4` |
| Magic Missile | `1d4` | `3d4+3` | Three darts at `1d4 + 1` each, and one click should throw all three |
| Sorcerous Burst | `1d8+CHA` | `1d8` | The spellcasting modifier caps how many *extra* d8s may be rolled; it is not added to the damage |

The pattern in the last two is worth carrying forward: `spellcasting ability modifier` in a body does
not always mean "add it to the roll", and a per-dart or per-ray spell states one unit of damage while
the click wants the volley.
