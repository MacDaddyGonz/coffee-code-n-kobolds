// The catalogue: the spells, feats and NPC actions the editor offers as a starting
// point. Content only — no validators, no arithmetic, no Convex `ctx`.
// `lib/sheet.ts` owns the shape of a sheet entry and every rule about what is
// storable; this file owns nothing but the words and the dice, so that adding a
// spell is a change a person can make without reading a line of validation code.
// The import below is type-only for the same reason it is in `lib/grid.ts`: this
// module has no runtime dependency on anything, which keeps it importable from the
// browser and from a test without dragging the sheet module along behind it.
//
// The roadmap left "hard-code the spell list or make it editable" open. This is the
// answer, and it is both: the catalogue is hard-coded, but a character stores a
// **copy** of the entry rather than a reference to it. `catalogueKey` is a
// breadcrumb recording where a copy came from, not a foreign key — nothing joins on
// it, a player is free to edit the copy on their sheet, and a key retired from this
// file leaves the characters that already have it working exactly as before. That is
// why `catalogueEntry` returns `undefined` rather than throwing, and why callers must
// treat a miss as ordinary rather than as corruption.
//
// ⚠️ **That last sentence stopped being hypothetical in Milestone 14 and is now the
// reason this file needed no migration.** Fourteen keys left the catalogue in one
// commit — the eight class features this file used to miscall feats, and six feats
// that exist in no SRD — and every character already holding one of them is
// untouched, because what is on their sheet is a copy and not a link. See the note
// on `FEATS`.
//
// The text is paraphrased for a DM reading it at the table, deliberately rather than
// lifted from the SRD. It is a prompt to remind someone of a rule they know, not a
// substitute for the rulebook, and it is short because it renders inside a sheet
// panel next to a dozen others.
//
// ⚠️ **The paraphrase is now load-bearing twice over, and the second reason arrived
// with the transcription.** `MAX_ENTRY_TEXT_LENGTH` is 600 and SRD spell prose
// routinely runs past it — Command's runs to about 1,300 characters and
// Prestidigitation's to 1,800 — so a corpus that lifted the source would have had to
// raise the cap on every sheet in every game to hold a paragraph nobody reads at the
// table. Paraphrasing keeps the cap where it is **and** keeps this bundle honest in a
// register it was not honest in before: it carries no SRD *prose*, in the same way
// `bundleGuard.test.ts` keeps it carrying no stat blocks.
//
// **Every spell prints its casting time and its duration**, including
// `Concentration, up to 1 minute`, and **nothing checks either**. No spell is dropped
// when its caster takes damage, no bonus action is counted, and no reaction is
// refused — see ADR 0011 decision 5, which stands. A field that says *concentration*
// is not a rule that enforces it, which is the distinction this project has now drawn
// five times.
//
// ⚠️ **The prose never states the to-hit**, on any entry, because the to-hit is now a
// field. A number written in both places is two places for it to disagree the moment
// somebody edits their copy, and a line reading `+4 to hit` beside a `toHit` of
// `1d20+6` is worse than one that says nothing. This is the rule `attackEntry` in
// lib/resolve.ts already applies to the bestiary, stated here for the corpus a person
// hand-writes; a test asserts it rather than trusting it.
//
// Nothing here reaches outside the subset in docs/requirements.md. Entries that would
// normally mention difficult terrain or being knocked prone have those clauses
// rewritten — Entangle's weeds hold a creature *fast*, Grease makes it *lose its
// footing* — because movement-impairing conditions are excluded by design and a
// catalogue entry describing one would be the first place they crept back in. The
// same applies to a *change of speed*: Longstrider, Haste and Fly say what a creature
// can now do rather than which number moved, because nothing in this application
// applies a spell's effect to a sheet, and a paraphrase naming the stat would be
// promising a change nothing makes. `rules.test.ts` sweeps for both.
//
// ---------------------------------------------------------------------------
// Where the spells came from, and why there is a script in `scripts/srd/`
// ---------------------------------------------------------------------------
//
// `SPELLS` is a transcription of the **5e (2024) SRD 5.2.1** spell chapter, capped at
// 3rd level because characters stop at level 5. It was scaffolded by
// `scripts/srd/spells.mjs`, which parses the source and derives the mechanical facts
// — the level, the category, the dice, the casting time, the duration, the caster's
// ability — and the prose was then written by hand over the top of what it emitted.
//
// **Re-running that script is not a refresh.** It emits a fresh scaffold to diff
// against, and the diff is what tells you which spells the source changed; it cannot
// regenerate this file, because the sentences here are not in the source. The script
// lives in `scripts/` deliberately: it is outside `bundleGuard.test.ts`' `/src` sweep
// and outside `corpusGuard.test.ts`' `convex/` sweep by construction, and it is
// imported by nothing that deploys. See `scripts/srd/README.md`.

import type { ContentEntry } from './sheet'

/**
 * A catalogue entry is a `ContentEntry` template: everything except the per-character
 * `id`, and without the `catalogueKey`, which is what a *copy* records about where it
 * came from rather than something the source of the copy carries.
 *
 * `ContentEntry` rather than `SheetEntry` because the **category is required** on
 * content — see the note on it in lib/sheet.ts.
 */
export type CatalogueEntry = Omit<ContentEntry, 'catalogueKey'> & { key: string }

/**
 * The spells: 27 cantrips and the 156 levelled spells of 1st, 2nd and 3rd level, which
 * is every spell reachable at character levels 1–5.
 *
 * ⚠️ **The list is 183 long and `MAX_SHEET_ENTRIES` is 40, and that inversion is new.**
 * Every earlier version of this corpus was short enough to be taken onto one sheet
 * wholesale, and `rules.test.ts` asserted exactly that. It no longer can, and no longer
 * should: a character prepares a handful of spells, and a picker that offered "add them
 * all" over the whole SRD would mint a sheet the server refuses. **The cap belongs to
 * the sheet and not to the corpus**, so the test that pinned the corpus against it now
 * pins only the two lists a creature might reasonably take entire.
 *
 * `roll` is the damage or the healing — what the spell does once it has happened.
 * **A spell that has to land first is a `weapon` and carries its to-hit in `toHit`**,
 * which is the shape a single `roll` could not express and the reason that field
 * exists. The three categories fall out of the spells themselves rather than being
 * imposed on them: Fire Bolt is aimed, Fireball simply goes off, Shield is declared.
 *
 * ⚠️ **`weapon` here means "the SRD says *make a spell attack*", and nothing else.**
 * Eighteen of the 183 do, and it is the one derivation in the scaffold that is a
 * judgement rather than a lookup — so it is worth knowing the two shapes that look like
 * weapons and are not. True Strike makes an attack with a *weapon you are holding*, so
 * the roll is that weapon's own entry and this one is a `passive`; Shillelagh changes a
 * club's damage die, which is the same thing said differently.
 *
 * ⚠️ **An `action` is an entry whose click throws the dice the spell's MAIN effect
 * deals.** Three spells in range have dice only in a corner — Web's strands burning
 * away, Meld into Stone's rock collapsing, Alter Self's optional natural weapons — and
 * all three are `passive`s whose prose names the dice instead. The alternative is an
 * entry that announces "uses Web" and then rolls 2d4 of fire nobody asked for.
 *
 * A caster's to-hit is written with the ability token of the class that most often
 * casts it, for exactly the reason the damage is — see the paragraph below.
 *
 * Rolls use ability tokens (`2d8+WIS`) instead of baked-in numbers wherever the
 * modifier genuinely belongs to the caster, because Milestone 4 resolves those
 * tokens against the sheet holding the entry and a number frozen here would be wrong
 * for everyone but the character it was written for. Where a spell is cast by
 * classes keyed off different abilities — Cure Wounds is as much a paladin's as a
 * cleric's — the entry names the commonest one. That is not a claim about the rules;
 * it is the least-editing default, and the copy on the sheet is editable precisely
 * so a paladin can change it to CHA.
 *
 * ⚠️ **"Commonest" is not "first named", and the SRD makes that trap easy to fall
 * into.** It lists a spell's classes alphabetically, so reading the first one answers
 * *Sorcerer* for Fire Bolt and would have re-keyed the most iconic wizard cantrip in the
 * game to Charisma because B sorts before W. The scaffold resolves ties in the order
 * Wizard, Cleric, Druid, Ranger, Bard, Sorcerer, Warlock, Paladin, which reproduces
 * every to-hit this corpus already had and settles the fourteen new ones the same way.
 *
 * **Every damage expression in range fits `ROLL_PATTERN`.** Nothing here needed
 * `roll: null` with its dice in the prose, which is worth recording because it was the
 * expected outcome and is not guaranteed for levels 4 and up.
 */
export const SPELLS: readonly CatalogueEntry[] = [
  {
    key: 'acid-arrow',
    name: 'Acid Arrow',
    text: 'Action · Instantaneous. A green arrow of acid streaks at one creature within 90 feet. It burns twice — the damage now and half again at the end of the target\'s next turn — and a miss still splashes it for half the first amount.',
    roll: '4d4',
    level: 2,
    category: 'weapon',
    toHit: '1d20+INT+PROF',
  },
  {
    key: 'acid-splash',
    name: 'Acid Splash',
    text: 'Action · Instantaneous. An acid bubble bursts in a 5-foot radius around a point within 60 feet. Each creature caught takes the damage unless it succeeds on a Dexterity saving throw.',
    roll: '1d6',
    level: 0,
    category: 'action',
  },
  {
    key: 'aid',
    name: 'Aid',
    text: 'Action · 8 hours. Three creatures within 30 feet gain 5 hit points, added to both their current total and their maximum. Another 5 for each slot level above 2nd.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'alarm',
    name: 'Alarm',
    text: '1 minute or ritual · 8 hours. Ward a door, a window or a 20-foot cube within 30 feet. For eight hours you are alerted — by a handbell only those nearby hear, or by a ping in your mind from up to a mile away — whenever anything you did not exempt enters it.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'alter-self',
    name: 'Alter Self',
    text: 'Action · Concentration, up to 1 hour. Reshape your own body: gills and webbed fingers to breathe water, a new face and voice, or natural weapons that strike for 1d6 and use your spellcasting ability. You can swap between the three while it lasts.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'animal-friendship',
    name: 'Animal Friendship',
    text: 'Action · 24 hours. One beast within 30 feet must succeed on a Wisdom saving throw or treat you as a friend for a day. Damaging it ends the spell at once.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'animal-messenger',
    name: 'Animal Messenger',
    text: 'Action or ritual · 24 hours. A tiny beast within 30 feet carries a message of twenty-five words to a place you name and a person you describe, covering about 25 miles a day, or 50 if it flies.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'animate-dead',
    name: 'Animate Dead',
    text: '1 minute · Instantaneous. Bones become a skeleton and a corpse becomes a zombie, obedient to a bonus action command from within 60 feet. Recast it on the same creature within a day to keep control, or it turns on everyone.',
    roll: null,
    level: 3,
    category: 'passive',
  },
  {
    key: 'arcane-lock',
    name: 'Arcane Lock',
    text: 'Action · Until dispelled. A door, chest or hatch you touch locks and cannot be opened by any ordinary means. You, anyone you name at casting, and anyone who says the password may still open it.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'arcanists-magic-aura',
    name: "Arcanist's Magic Aura",
    text: 'Action · 24 hours. A willing creature reads to magic as a different creature type, or an object reads as magical, mundane or enchanted by a school you choose. Cast it on the same target daily for a month and it lasts until dispelled.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'augury',
    name: 'Augury',
    text: '1 minute or ritual · Instantaneous. Ask about a course of action you will take in the next half hour and receive one word: weal, woe, both, or nothing either way. Casting it more than once a day risks a false answer.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'bane',
    name: 'Bane',
    text: 'Action · Concentration, up to 1 minute. Up to three creatures within 30 feet must make a Charisma saving throw. Each one that fails subtracts the die from every attack roll and every saving throw it makes while you concentrate.',
    roll: '1d4',
    level: 1,
    category: 'action',
  },
  {
    key: 'barkskin',
    name: 'Barkskin',
    text: 'Bonus Action · 1 hour. A willing creature you touch grows bark-like skin. Its Armour Class becomes 17 for the hour if it was lower than that.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'beacon-of-hope',
    name: 'Beacon of Hope',
    text: 'Action · Concentration, up to 1 minute. Any number of creatures within 30 feet gain advantage on Wisdom saves and on death saving throws, and every heal they receive restores the most it possibly could.',
    roll: null,
    level: 3,
    category: 'passive',
  },
  {
    key: 'bestow-curse',
    name: 'Bestow Curse',
    text: 'Action · Concentration, up to 1 minute. Touch a creature; on a failed Wisdom saving throw it is cursed. Choose one: disadvantage on one ability\'s checks and saves, disadvantage on attacks against you, a Wisdom save each turn or it only dodges, or the die in extra necrotic damage whenever you hurt it.',
    roll: '1d8',
    level: 3,
    category: 'action',
  },
  {
    key: 'bless',
    name: 'Bless',
    text: 'Action · Concentration, up to 1 minute. Up to three creatures within 30 feet add the die to every attack roll and every saving throw they make while you concentrate.',
    roll: '1d4',
    level: 1,
    category: 'action',
  },
  {
    key: 'blindness-deafness',
    name: 'Blindness/Deafness',
    text: 'Action · 1 minute. One creature within 120 feet must succeed on a Constitution saving throw or be blinded or deafened, your choice. It repeats the save at the end of each of its turns.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'blink',
    name: 'Blink',
    text: 'Action · 1 minute. Roll the die at the end of each of your turns for a minute. On a 4 or better you slip into the Ethereal Plane until the start of your next turn, where nothing on this side can reach you and you can see about 60 feet back.',
    roll: '1d6',
    level: 3,
    category: 'action',
  },
  {
    key: 'blur',
    name: 'Blur',
    text: 'Action · Concentration, up to 1 minute. Your outline swims and doubles. Every attack roll against you has disadvantage, unless the attacker sees by blindsight or truesight.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'burning-hands',
    name: 'Burning Hands',
    text: 'Action · Instantaneous. A sheet of flame in a 15-foot cone from your fingertips. Each creature caught takes the damage, or half on a successful Dexterity saving throw, and loose flammable things start burning.',
    roll: '3d6',
    level: 1,
    category: 'action',
  },
  {
    key: 'call-lightning',
    name: 'Call Lightning',
    text: 'Action · Concentration, up to 10 minutes. A storm cloud forms overhead and drops a bolt on a point you choose within 120 feet. Everything within 5 feet of it takes the damage, halved on a successful Dexterity saving throw, and you can call the bolt down again every turn.',
    roll: '3d10',
    level: 3,
    category: 'action',
  },
  {
    key: 'calm-emotions',
    name: 'Calm Emotions',
    text: 'Action · Concentration, up to 1 minute. Each humanoid in a 20-foot radius within 60 feet must succeed on a Charisma saving throw or, at your choice for each, become immune to being charmed and frightened, or lose its hostility toward creatures you name.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'charm-person',
    name: 'Charm Person',
    text: 'Action · 1 hour. One humanoid within 30 feet must succeed on a Wisdom saving throw or treat you as a friend for an hour. It saves with advantage if you are already fighting it, and it knows exactly what you did when the spell ends.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'chill-touch',
    name: 'Chill Touch',
    text: 'Action · Instantaneous. A grave-cold hand reaches for one creature within your reach. On a hit it takes necrotic damage and can regain no hit points until the end of your next turn.',
    roll: '1d10',
    level: 0,
    category: 'weapon',
    toHit: '1d20+INT+PROF',
  },
  {
    key: 'chromatic-orb',
    name: 'Chromatic Orb',
    text: 'Action · Instantaneous. Hurl an orb of acid, cold, fire, lightning, poison or thunder at a target within 90 feet. Roll the same number on two or more of the damage dice and it leaps to a second creature within 30 feet, aimed and rolled again.',
    roll: '3d8',
    level: 1,
    category: 'weapon',
    toHit: '1d20+INT+PROF',
  },
  {
    key: 'clairvoyance',
    name: 'Clairvoyance',
    text: '10 minutes · Concentration, up to 10 minutes. An invisible sensor appears at a place within a mile that you have seen, or somewhere obvious that you have not. Choose seeing or hearing and use that sense through it; a bonus action switches.',
    roll: null,
    level: 3,
    category: 'passive',
  },
  {
    key: 'color-spray',
    name: 'Color Spray',
    text: 'Action · Instantaneous. A dazzling spray of colour in a 15-foot cone. Each creature caught must succeed on a Constitution saving throw or be blinded until the end of your next turn.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'command',
    name: 'Command',
    text: 'Action · Instantaneous. Speak one word to a creature within 60 feet. On a failed Wisdom saving throw it obeys on its next turn and does nothing else: approach, drop what it holds, flee, grovel, or halt where it is.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'comprehend-languages',
    name: 'Comprehend Languages',
    text: 'Action or ritual · 1 hour. For an hour you understand every spoken and signed language you hear, and every written one you are touching — about a minute a page. It does not break codes or secret messages.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'conjure-animals',
    name: 'Conjure Animals',
    text: 'Action · Concentration, up to 10 minutes. A large pack of spectral animals appears within 60 feet and moves 30 feet whenever you do. Anything that comes within 10 feet of it takes the damage on a failed Dexterity saving throw, once a turn.',
    roll: '3d10',
    level: 3,
    category: 'action',
  },
  {
    key: 'continual-flame',
    name: 'Continual Flame',
    text: 'Action · Until dispelled. A flame springs from an object you touch and burns for ever without heat or fuel, casting bright light 20 feet and dim light 20 beyond. It can be covered but never put out.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'counterspell',
    name: 'Counterspell',
    text: 'Reaction · Instantaneous. Taken when you see a creature within 60 feet casting. It makes a Constitution saving throw, and on a failure the spell does nothing and the action is wasted — though the slot is not spent.',
    roll: null,
    level: 3,
    category: 'passive',
  },
  {
    key: 'create-food-and-water',
    name: 'Create Food and Water',
    text: 'Action · Instantaneous. Forty-five pounds of plain food and thirty gallons of clean water appear within 30 feet. The food is dull but nourishing, and spoils after a day if nobody eats it.',
    roll: null,
    level: 3,
    category: 'passive',
  },
  {
    key: 'create-or-destroy-water',
    name: 'Create or Destroy Water',
    text: 'Action · Instantaneous. Make ten gallons of clean water within 30 feet, or rain it down in a 30-foot cube to douse open flames. Or destroy that much water in a container, or a fog of the same size.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'cure-wounds',
    name: 'Cure Wounds',
    text: 'Action · Instantaneous. Touch a creature and restore the rolled hit points plus your spellcasting modifier. Another 2d8 for each slot level above 1st.',
    roll: '2d8+WIS',
    level: 1,
    category: 'action',
  },
  {
    key: 'dancing-lights',
    name: 'Dancing Lights',
    text: 'Action · Concentration, up to 1 minute. Up to four hovering lights within 120 feet, or one vaguely humanlike glow, each shedding dim light 10 feet. A bonus action moves them up to 60 feet.',
    roll: null,
    level: 0,
    category: 'passive',
  },
  {
    key: 'darkness',
    name: 'Darkness',
    text: 'Action · Concentration, up to 10 minutes. A 15-foot sphere of magical darkness within 60 feet that darkvision cannot see through and ordinary light cannot lift. Cast on an object instead, and covering that object blocks it.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'darkvision',
    name: 'Darkvision',
    text: 'Action · 8 hours. A willing creature you touch sees in the dark out to 150 feet for eight hours.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'daylight',
    name: 'Daylight',
    text: 'Action · 1 hour. Real sunlight fills a 60-foot sphere within 60 feet and sheds dim light 60 feet beyond it. Cast on an object instead, and covering that object blocks it. It dispels lesser darkness it overlaps.',
    roll: null,
    level: 3,
    category: 'passive',
  },
  {
    key: 'detect-evil-and-good',
    name: 'Detect Evil and Good',
    text: 'Action · Concentration, up to 10 minutes. You sense where any aberration, celestial, elemental, fey, fiend or undead is within 30 feet. A foot of stone, an inch of metal or a sheet of lead blocks it.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'detect-magic',
    name: 'Detect Magic',
    text: 'Action or ritual · Concentration, up to 10 minutes. You sense magic within 30 feet, and a moment spent on an aura tells you which school made it. A foot of stone, an inch of metal or a sheet of lead blocks it.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'detect-poison-and-disease',
    name: 'Detect Poison and Disease',
    text: 'Action or ritual · Concentration, up to 10 minutes. You sense poisons, venomous creatures and magical contagions within 30 feet, and know which kind each one is.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'detect-thoughts',
    name: 'Detect Thoughts',
    text: 'Action · Concentration, up to 1 minute. Sense that thinking minds are within 30 feet, or read one of them: surface thoughts first, and deeper ones if it fails a Wisdom saving throw — which also tells it exactly what you are doing.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'disguise-self',
    name: 'Disguise Self',
    text: 'Action · 1 hour. You and everything you are wearing look different for an hour — a foot taller or shorter, heavier or lighter, any face you like. It does not survive being touched.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'dispel-magic',
    name: 'Dispel Magic',
    text: 'Action · Instantaneous. End one spell on a creature, an object or an area within 120 feet. Anything of 3rd level or lower ends outright; for a higher one, make a spellcasting ability check against a DC of 10 plus that spell\'s level.',
    roll: null,
    level: 3,
    category: 'passive',
  },
  {
    key: 'dissonant-whispers',
    name: 'Dissonant Whispers',
    text: 'Action · Instantaneous. A discordant melody in one mind within 60 feet. On a failed Wisdom saving throw it takes the damage and must spend its reaction running from you; on a success, half damage and nothing else.',
    roll: '3d6',
    level: 1,
    category: 'action',
  },
  {
    key: 'divine-favor',
    name: 'Divine Favor',
    text: 'Bonus Action · 1 minute. For a minute your weapon strikes carry the die in extra radiant damage.',
    roll: '1d4',
    level: 1,
    category: 'action',
  },
  {
    key: 'divine-smite',
    name: 'Divine Smite',
    text: 'Bonus Action · Instantaneous. Taken the instant you land a melee weapon or unarmed strike. The target takes the damage as radiance, another 1d8 if it is a fiend or undead, and another 1d8 for each slot level above 1st.',
    roll: '2d8',
    level: 1,
    category: 'action',
  },
  {
    key: 'dragons-breath',
    name: "Dragon's Breath",
    text: 'Bonus Action · Concentration, up to 1 minute. Touch a willing creature and choose acid, cold, fire, lightning or poison. For a minute it can breathe a 15-foot cone; everything caught takes the damage, halved on a successful Dexterity saving throw.',
    roll: '3d6',
    level: 2,
    category: 'action',
  },
  {
    key: 'druidcraft',
    name: 'Druidcraft',
    text: 'Action · Instantaneous. A small nature trick within 30 feet: a token showing tomorrow\'s weather, a flower opened, a harmless drift of leaves or a snatch of birdsong, or a flame the size of a candle lit or snuffed.',
    roll: null,
    level: 0,
    category: 'passive',
  },
  {
    key: 'eldritch-blast',
    name: 'Eldritch Blast',
    text: 'Action · Instantaneous. A beam of crackling force at one creature or object within 120 feet. A higher-level warlock fires more beams, each aimed and rolled separately.',
    roll: '1d10',
    level: 0,
    category: 'weapon',
    toHit: '1d20+CHA+PROF',
  },
  {
    key: 'elementalism',
    name: 'Elementalism',
    text: 'Action · Instantaneous. A small elemental trick within 30 feet, each in a 5-foot cube: a breeze that stirs dust and closes shutters, a shroud of sand, harmless scented embers, or a spray of water.',
    roll: null,
    level: 0,
    category: 'passive',
  },
  {
    key: 'enhance-ability',
    name: 'Enhance Ability',
    text: 'Action · Concentration, up to 1 hour. Touch a creature and name Strength, Dexterity, Intelligence, Wisdom or Charisma. It has advantage on ability checks with that one for the hour.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'enlarge-reduce',
    name: 'Enlarge/Reduce',
    text: 'Action · Concentration, up to 1 minute. A creature or object within 30 feet grows or shrinks one size, an unwilling creature only if it fails a Constitution saving throw. Grown, it has advantage on Strength rolls and adds the die to its weapon damage; shrunk, it has disadvantage and subtracts the die.',
    roll: '1d4',
    level: 2,
    category: 'action',
  },
  {
    key: 'ensnaring-strike',
    name: 'Ensnaring Strike',
    text: 'Bonus Action · Concentration, up to 1 minute. Taken the instant you hit a creature with a weapon. Vines seize it unless it succeeds on a Strength saving throw, dealing the die in piercing damage at the start of each of its turns until somebody frees it with a Strength (Athletics) check.',
    roll: '1d6',
    level: 1,
    category: 'action',
  },
  {
    key: 'entangle',
    name: 'Entangle',
    text: 'Action · Concentration, up to 1 minute. Grasping weeds sprout across a 20-foot square within 90 feet. Every other creature there must succeed on a Strength saving throw or be held fast until it works itself loose with a Strength (Athletics) check.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'enthrall',
    name: 'Enthrall',
    text: 'Action · Concentration, up to 1 minute. A stream of distracting words. Creatures of your choice within 60 feet that fail a Wisdom saving throw take a −10 penalty to Perception checks and to their passive score. Anything already fighting you succeeds automatically.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'expeditious-retreat',
    name: 'Expeditious Retreat',
    text: 'Bonus Action · Concentration, up to 10 minutes. You Dash at once, and can Dash again as a bonus action on every turn for the next ten minutes.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'faerie-fire',
    name: 'Faerie Fire',
    text: 'Action · Concentration, up to 1 minute. Everything in a 20-foot cube within 60 feet is outlined in coloured light — creatures too, if they fail a Dexterity saving throw. Anything outlined sheds dim light, cannot be invisible, and is attacked with advantage.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'false-life',
    name: 'False Life',
    text: 'Action · Instantaneous. A brief necromantic ward gives you the rolled temporary hit points. Another 5 for each slot level above 1st.',
    roll: '2d4+4',
    level: 1,
    category: 'action',
  },
  {
    key: 'fear',
    name: 'Fear',
    text: 'Action · Concentration, up to 1 minute. Each creature in a 30-foot cone must succeed on a Wisdom saving throw or drop whatever it is holding and flee from you. It saves again at the end of any turn it finishes out of your sight.',
    roll: null,
    level: 3,
    category: 'passive',
  },
  {
    key: 'feather-fall',
    name: 'Feather Fall',
    text: 'Reaction · 1 minute. Taken when you or a creature within 60 feet falls. Up to five falling creatures drift down gently and take no damage from the landing.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'find-familiar',
    name: 'Find Familiar',
    text: '1 hour or ritual · Instantaneous. A spirit in the shape of a bat, cat, frog, hawk, lizard, octopus, owl, rat, raven, spider or weasel serves you. It cannot attack, you can talk to it within 100 feet and see through its eyes, and it vanishes rather than dying.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'find-steed',
    name: 'Find Steed',
    text: 'Action · Instantaneous. A celestial, fey or fiendish steed appears within 30 feet — a horse, a camel, a dire wolf, an elk. It shares your initiative, understands you, and vanishes rather than dying.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'find-traps',
    name: 'Find Traps',
    text: 'Action · Instantaneous. You sense that a trap of any kind is somewhere in your line of sight within 120 feet, and what sort of danger it poses — but never where it is.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'fireball',
    name: 'Fireball',
    text: 'Action · Instantaneous. A roaring sphere of flame fills a 20-foot radius around a point within 150 feet. Each creature there takes the damage, halved on a successful Dexterity saving throw. Another 1d6 per slot level above 3rd.',
    roll: '8d6',
    level: 3,
    category: 'action',
  },
  {
    key: 'fire-bolt',
    name: 'Fire Bolt',
    text: 'Action · Instantaneous. A mote of fire hurled at one target within 120 feet. On a hit it burns, and it sets light to anything flammable nobody is holding or wearing.',
    roll: '1d10',
    level: 0,
    category: 'weapon',
    toHit: '1d20+INT+PROF',
  },
  {
    key: 'flame-blade',
    name: 'Flame Blade',
    text: 'Bonus Action · Concentration, up to 10 minutes. A scimitar of fire in your free hand, swung as a Magic action. Let go and it vanishes; a bonus action calls it back. It sheds bright light 10 feet.',
    roll: '3d6+WIS',
    level: 2,
    category: 'weapon',
    toHit: '1d20+WIS+PROF',
  },
  {
    key: 'flaming-sphere',
    name: 'Flaming Sphere',
    text: 'Action · Concentration, up to 1 minute. A rolling ball of fire within 60 feet. Anything ending its turn within 5 feet takes the damage, halved on a successful Dexterity saving throw, and a bonus action rolls it 30 feet.',
    roll: '2d6',
    level: 2,
    category: 'action',
  },
  {
    key: 'floating-disk',
    name: 'Floating Disk',
    text: 'Action or ritual · 1 hour. A three-foot disc of force hovers just off the ground within 30 feet and carries up to 500 pounds. It follows you, keeping within 20 feet, but cannot climb far or cross deep water.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'fly',
    name: 'Fly',
    text: 'Action · Concentration, up to 10 minutes. A willing creature you touch can fly and hover, covering 60 feet a turn, for ten minutes. It drops when the spell ends unless it can stop itself.',
    roll: null,
    level: 3,
    category: 'passive',
  },
  {
    key: 'fog-cloud',
    name: 'Fog Cloud',
    text: 'Action · Concentration, up to 1 hour. A 20-foot sphere of fog within 120 feet, heavily obscuring everything inside it. A strong wind blows it away.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'gaseous-form',
    name: 'Gaseous Form',
    text: 'Action · Concentration, up to 1 hour. A willing creature and all its gear become a drifting mist for an hour: it seeps through cracks, hovers, resists ordinary weapons, and cannot talk, attack or use objects.',
    roll: null,
    level: 3,
    category: 'passive',
  },
  {
    key: 'gentle-repose',
    name: 'Gentle Repose',
    text: 'Action or ritual · 10 days. A corpse you touch neither rots nor rises for ten days, and those days do not count against the time limit for raising it.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'glyph-of-warding',
    name: 'Glyph of Warding',
    text: '1 hour · Until dispelled or triggered. Inscribe a hidden sigil that fires when a trigger you set is met. Either it bursts in a 20-foot radius for the damage, halved on a successful Dexterity saving throw, or it releases a spell of 3rd level or lower stored inside it.',
    roll: '5d8',
    level: 3,
    category: 'action',
  },
  {
    key: 'goodberry',
    name: 'Goodberry',
    text: 'Action · 24 hours. Ten berries, each a bonus action to eat, each worth one hit point and a day\'s food. Whatever is left disappears after a day.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'grease',
    name: 'Grease',
    text: 'Action · 1 minute. A 10-foot square within 60 feet turns slick for a minute. Anything standing there when it appears, and anything entering or ending its turn on it, must succeed on a Dexterity saving throw or lose its footing.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'guidance',
    name: 'Guidance',
    text: 'Action · Concentration, up to 1 minute. Touch a willing creature and name a skill. While you concentrate it adds the die to every ability check made with that skill.',
    roll: '1d4',
    level: 0,
    category: 'action',
  },
  {
    key: 'guiding-bolt',
    name: 'Guiding Bolt',
    text: 'Action · 1 round. A lance of light at one creature within 120 feet. On a hit, the next attack made against that creature before the end of your next turn has advantage.',
    roll: '4d6',
    level: 1,
    category: 'weapon',
    toHit: '1d20+WIS+PROF',
  },
  {
    key: 'gust-of-wind',
    name: 'Gust of Wind',
    text: 'Action · Concentration, up to 1 minute. A 60-foot line of roaring wind. Creatures caught must succeed on a Strength saving throw or be shoved 15 feet along it, and it scatters gas, smoke and unshielded flames.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'haste',
    name: 'Haste',
    text: 'Action · Concentration, up to 1 minute. A willing creature within 30 feet covers twice as much ground, gains +2 Armour Class and advantage on Dexterity saves, and gets one extra action each turn for attacking once, dashing, disengaging, hiding or using an object. When it ends the creature is left reeling for a turn.',
    roll: null,
    level: 3,
    category: 'passive',
  },
  {
    key: 'healing-word',
    name: 'Healing Word',
    text: 'Bonus Action · Instantaneous. A creature within 60 feet regains the rolled hit points plus your spellcasting modifier — the spell for getting somebody back on their feet mid-fight. Another 2d4 per slot level above 1st.',
    roll: '2d4+WIS',
    level: 1,
    category: 'action',
  },
  {
    key: 'heat-metal',
    name: 'Heat Metal',
    text: 'Action · Concentration, up to 1 minute. A metal weapon or suit of armour within 60 feet glows red hot. Whoever is touching it takes the damage now, and again as a bonus action on each later turn, and must succeed on a Constitution saving throw or let go.',
    roll: '2d8',
    level: 2,
    category: 'action',
  },
  {
    key: 'hellish-rebuke',
    name: 'Hellish Rebuke',
    text: 'Reaction · Instantaneous. Taken when a creature you can see within 60 feet damages you. Green flame wraps it: full damage on a failed Dexterity saving throw, half on a success.',
    roll: '2d10',
    level: 1,
    category: 'action',
  },
  {
    key: 'heroism',
    name: 'Heroism',
    text: 'Action · Concentration, up to 1 minute. A willing creature you touch cannot be frightened and gains temporary hit points equal to your spellcasting modifier at the start of each of its turns.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'hex',
    name: 'Hex',
    text: 'Bonus Action · Concentration, up to 1 hour. Curse a creature within 90 feet: every hit you land on it deals the die in extra necrotic damage, and it has disadvantage on checks with one ability you name. Move the hex with a bonus action once it drops.',
    roll: '1d6',
    level: 1,
    category: 'action',
  },
  {
    key: 'hideous-laughter',
    name: 'Hideous Laughter',
    text: 'Action · Concentration, up to 1 minute. One creature within 30 feet must succeed on a Wisdom saving throw or collapse in helpless laughter, unable to act. It saves again at the end of each of its turns and each time it takes damage.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'hold-person',
    name: 'Hold Person',
    text: 'Action · Concentration, up to 1 minute. One humanoid within 60 feet must succeed on a Wisdom saving throw or be paralyzed while you concentrate, repeating the save at the end of each of its turns. Attacks made against it from within five feet are critical hits.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'hunters-mark',
    name: "Hunter's Mark",
    text: 'Bonus Action · Concentration, up to 1 hour. Mark a creature within 90 feet as your quarry: every hit you land on it deals the die in extra force damage, and you track it with advantage. Move the mark with a bonus action once it drops.',
    roll: '1d6',
    level: 1,
    category: 'action',
  },
  {
    key: 'hypnotic-pattern',
    name: 'Hypnotic Pattern',
    text: 'Action · Concentration, up to 1 minute. A twist of colour in a 30-foot cube within 120 feet. Every creature that sees it must succeed on a Wisdom saving throw or stand charmed and helpless until it takes damage or somebody shakes it out of the stupor.',
    roll: null,
    level: 3,
    category: 'passive',
  },
  {
    key: 'ice-knife',
    name: 'Ice Knife',
    text: 'Action · Instantaneous. A shard of ice at one creature within 60 feet. Hit or miss it then bursts: the target and everything within 5 feet takes 2d6 cold damage on a failed Dexterity saving throw.',
    roll: '1d10',
    level: 1,
    category: 'weapon',
    toHit: '1d20+INT+PROF',
  },
  {
    key: 'identify',
    name: 'Identify',
    text: '1 minute or ritual · Instantaneous. Touch an object and learn what it does, whether it needs attunement, how many charges it has and what made it. Touch a creature instead and learn which spells are on it.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'illusory-script',
    name: 'Illusory Script',
    text: '1 minute or ritual · 10 days. Writing that reads normally to you and anyone you name, and as unintelligible script to everybody else. It can instead say something else entirely, in any language you know.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'inflict-wounds',
    name: 'Inflict Wounds',
    text: 'Action · Instantaneous. Touch a creature with a hand of withering necrotic energy. Full damage on a failed Constitution saving throw, half on a success.',
    roll: '2d10',
    level: 1,
    category: 'action',
  },
  {
    key: 'invisibility',
    name: 'Invisibility',
    text: 'Action · Concentration, up to 1 hour. A creature you touch is invisible for up to an hour. It ends the moment that creature makes an attack roll, deals damage or casts a spell.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'jump',
    name: 'Jump',
    text: 'Bonus Action · 1 minute. A willing creature you touch can leap 30 feet once on each of its turns for a minute.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'knock',
    name: 'Knock',
    text: 'Action · Instantaneous. One lock, bar or stuck lid within 60 feet opens, with a knock audible 300 feet away. An Arcane Lock is only suppressed, for ten minutes.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'lesser-restoration',
    name: 'Lesser Restoration',
    text: 'Bonus Action · Instantaneous. Touch a creature and end one condition on it: blinded, deafened, paralyzed or poisoned.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'levitate',
    name: 'Levitate',
    text: 'Action · Concentration, up to 10 minutes. A creature or loose object within 60 feet rises up to 20 feet and hangs there; an unwilling creature resists with a Constitution saving throw. It can only haul itself along by pushing off walls and ceilings.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'light',
    name: 'Light',
    text: 'Action · 1 hour. An object you touch sheds bright light 20 feet and dim light 20 feet beyond, in any colour you like. Covering it blocks the light, and casting the spell again ends it.',
    roll: null,
    level: 0,
    category: 'passive',
  },
  {
    key: 'lightning-bolt',
    name: 'Lightning Bolt',
    text: 'Action · Instantaneous. A stroke of lightning 100 feet long and 5 feet wide leaps from your hand. Everything in the line takes the damage, halved on a successful Dexterity saving throw.',
    roll: '8d6',
    level: 3,
    category: 'action',
  },
  {
    key: 'locate-animals-or-plants',
    name: 'Locate Animals or Plants',
    text: 'Action or ritual · Instantaneous. Name a kind of beast or plant and learn the direction and distance to the nearest one within five miles.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'locate-object',
    name: 'Locate Object',
    text: 'Action · Concentration, up to 10 minutes. Name an object you know well and sense the direction to it within 1,000 feet, and whether it is moving. Any thickness of lead in the way blocks it.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'longstrider',
    name: 'Longstrider',
    text: 'Action · 1 hour. A creature you touch covers ten more feet of ground on each of its turns for the next hour.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'mage-armor',
    name: 'Mage Armor',
    text: 'Action · 8 hours. A willing creature wearing no armour gains a shimmering ward: its base Armour Class becomes 13 plus its Dexterity modifier. It ends if the creature puts armour on.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'mage-hand',
    name: 'Mage Hand',
    text: 'Action · 1 minute. A spectral hand appears within 30 feet and can fetch, carry or fiddle with something light — a key, a lever, a lantern. It cannot attack, use a magic item, or lift more than ten pounds.',
    roll: null,
    level: 0,
    category: 'passive',
  },
  {
    key: 'magic-circle',
    name: 'Magic Circle',
    text: '1 minute · 1 hour. A 10-foot cylinder of runes within 10 feet. Celestials, elementals, fey, fiends or undead — your choice — cannot enter it, cannot charm or frighten anyone inside, and attack them with disadvantage. Cast it inverted to hold one in.',
    roll: null,
    level: 3,
    category: 'passive',
  },
  {
    key: 'magic-missile',
    name: 'Magic Missile',
    text: 'Action · Instantaneous. Three darts of force that strike automatically: no attack roll and no saving throw. Each deals 1d4+1 and they can be split between targets however you like. One more dart per slot level above 1st.',
    roll: '3d4+3',
    level: 1,
    category: 'action',
  },
  {
    key: 'magic-mouth',
    name: 'Magic Mouth',
    text: '1 minute or ritual · Until dispelled. An object within 30 feet holds a message of twenty-five words and speaks it in your voice, at your volume, when a trigger you set occurs.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'magic-weapon',
    name: 'Magic Weapon',
    text: 'Bonus Action · 1 hour. A non-magical weapon you touch becomes magical, with a +1 bonus to its attack and damage rolls for an hour. A 3rd-level slot makes that +2.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'major-image',
    name: 'Major Image',
    text: 'Action · Concentration, up to 10 minutes. An illusion no bigger than a 20-foot cube within 120 feet, complete with sound, smell and warmth. It deals no damage, and a creature that studies it sees through with an Intelligence (Investigation) check.',
    roll: null,
    level: 3,
    category: 'passive',
  },
  {
    key: 'mass-healing-word',
    name: 'Mass Healing Word',
    text: 'Bonus Action · Instantaneous. Up to six creatures within 60 feet each regain the rolled hit points plus your spellcasting modifier. Another 1d4 for each slot level above 3rd.',
    roll: '2d4+WIS',
    level: 3,
    category: 'action',
  },
  {
    key: 'meld-into-stone',
    name: 'Meld into Stone',
    text: 'Action or ritual · 8 hours. Step into stone big enough to hold you and merge with it, gear and all, for up to eight hours. You cannot see out, and if the stone is destroyed you are thrown clear and take 6d6 damage.',
    roll: null,
    level: 3,
    category: 'passive',
  },
  {
    key: 'mending',
    name: 'Mending',
    text: '1 minute · Instantaneous. One break or tear no more than a foot across — a chain link, a torn cloak, a leaking wineskin — is repaired without trace. It cannot restore magic to an item that has lost it.',
    roll: null,
    level: 0,
    category: 'passive',
  },
  {
    key: 'message',
    name: 'Message',
    text: 'Action · 1 round. Whisper to one creature within 120 feet; only it hears, and only you hear its whispered reply. Magical silence, a foot of stone, metal or wood, or a sheet of lead blocks it.',
    roll: null,
    level: 0,
    category: 'passive',
  },
  {
    key: 'mind-spike',
    name: 'Mind Spike',
    text: 'Action · Concentration, up to 1 hour. A spike of psionic force into one mind within 120 feet: full damage on a failed Wisdom saving throw, half on a success. On a failure you also always know where it is, and it cannot hide from you.',
    roll: '3d8',
    level: 2,
    category: 'action',
  },
  {
    key: 'minor-illusion',
    name: 'Minor Illusion',
    text: 'Action · 1 minute. Either a sound, from a whisper to a scream, or the image of an object no bigger than a 5-foot cube, within 30 feet. A creature that studies it sees through with an Intelligence (Investigation) check.',
    roll: null,
    level: 0,
    category: 'passive',
  },
  {
    key: 'mirror-image',
    name: 'Mirror Image',
    text: 'Action · 1 minute. Three illusory copies of you shift about in your space. Each time an attack lands, roll a d6 for every copy left; on a 3 or better a copy takes it and is destroyed.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'misty-step',
    name: 'Misty Step',
    text: 'Bonus Action · Instantaneous. You vanish in a puff of silver mist and reappear in an unoccupied space you can see up to 30 feet away.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'moonbeam',
    name: 'Moonbeam',
    text: 'Action · Concentration, up to 1 minute. A 5-foot pillar of pale light within 120 feet, moved 60 feet as a Magic action. Anything caught makes a Constitution saving throw for full or half damage, and a shape-shifter is forced back into its true form.',
    roll: '2d10',
    level: 2,
    category: 'action',
  },
  {
    key: 'nondetection',
    name: 'Nondetection',
    text: 'Action · 8 hours. For eight hours a creature, place or object you touch cannot be targeted by divination magic or seen through a scrying sensor.',
    roll: null,
    level: 3,
    category: 'passive',
  },
  {
    key: 'pass-without-trace',
    name: 'Pass without Trace',
    text: 'Action · Concentration, up to 1 hour. A concealing aura 30 feet around you. You and everyone you choose gain a +10 bonus to Stealth checks and leave no tracks at all.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'phantasmal-force',
    name: 'Phantasmal Force',
    text: 'Action · Concentration, up to 1 minute. On a failed Intelligence saving throw, a creature within 60 feet perceives an illusion only it can see and rationalises anything that does not add up. If the illusion is something dangerous it deals the damage each turn.',
    roll: '2d8',
    level: 2,
    category: 'action',
  },
  {
    key: 'phantom-steed',
    name: 'Phantom Steed',
    text: '1 minute or ritual · 1 hour. A quasi-real horse appears within 30 feet, saddled and bridled, and carries a rider thirteen miles in the hour before it fades. The rider gets a minute to dismount.',
    roll: null,
    level: 3,
    category: 'passive',
  },
  {
    key: 'plant-growth',
    name: 'Plant Growth',
    text: 'Action or 8 hours · Instantaneous. Overgrow a 100-foot radius within 150 feet so that crossing it costs four times the effort, leaving any patches you like untouched. Or spend eight hours enriching half a mile of farmland to double its yield for a year.',
    roll: null,
    level: 3,
    category: 'passive',
  },
  {
    key: 'poison-spray',
    name: 'Poison Spray',
    text: 'Action · Instantaneous. A puff of toxic mist at one creature within 30 feet, which burns its lungs on a hit.',
    roll: '1d12',
    level: 0,
    category: 'weapon',
    toHit: '1d20+INT+PROF',
  },
  {
    key: 'prayer-of-healing',
    name: 'Prayer of Healing',
    text: '10 minutes · Instantaneous. Up to five creatures who stay within 30 feet for the whole casting gain the benefit of a short rest and the rolled hit points as well. None of them can be helped this way again until they finish a long rest.',
    roll: '2d8',
    level: 2,
    category: 'action',
  },
  {
    key: 'prestidigitation',
    name: 'Prestidigitation',
    text: 'Action · Up to 1 hour. A parlour trick within 10 feet: sparks or an odd smell, a candle lit or snuffed, a cubic foot cleaned or soiled, something chilled, warmed or flavoured, a mark on a surface, or a trinket in your hand. Three can be running at once.',
    roll: null,
    level: 0,
    category: 'passive',
  },
  {
    key: 'produce-flame',
    name: 'Produce Flame',
    text: 'Bonus Action · 10 minutes. A flame in your hand that burns nothing and sheds bright light 20 feet. While it lasts, a Magic action hurls it at a creature or object within 60 feet.',
    roll: '1d8',
    level: 0,
    category: 'weapon',
    toHit: '1d20+WIS+PROF',
  },
  {
    key: 'protection-from-energy',
    name: 'Protection from Energy',
    text: 'Action · Concentration, up to 1 hour. A willing creature you touch resists one damage type of your choice — acid, cold, fire, lightning or thunder — for the hour.',
    roll: null,
    level: 3,
    category: 'passive',
  },
  {
    key: 'protection-from-evil-and-good',
    name: 'Protection from Evil and Good',
    text: 'Action · Concentration, up to 10 minutes. Aberrations, celestials, elementals, fey, fiends and undead attack the warded creature with disadvantage, cannot possess, charm or frighten it, and it saves with advantage against anything of theirs already on it.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'protection-from-poison',
    name: 'Protection from Poison',
    text: 'Action · 1 hour. Touch a creature and cure it of poison. For an hour it resists poison damage and saves with advantage against being poisoned again.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'purify-food-and-drink',
    name: 'Purify Food and Drink',
    text: 'Action or ritual · Instantaneous. All the ordinary food and drink in a 5-foot radius within 10 feet is cleansed of poison and rot.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'ray-of-enfeeblement',
    name: 'Ray of Enfeeblement',
    text: 'Action · Concentration, up to 1 minute. A beam of enervating energy at a creature within 60 feet. On a failed Constitution saving throw it has disadvantage on everything Strength-based and subtracts the die from every damage roll it makes, saving again each turn.',
    roll: '1d8',
    level: 2,
    category: 'action',
  },
  {
    key: 'ray-of-frost',
    name: 'Ray of Frost',
    text: 'Action · Instantaneous. A frigid beam of blue-white light at one creature within 60 feet, which chills it to the bone on a hit.',
    roll: '1d8',
    level: 0,
    category: 'weapon',
    toHit: '1d20+INT+PROF',
  },
  {
    key: 'ray-of-sickness',
    name: 'Ray of Sickness',
    text: 'Action · Instantaneous. A greenish ray at one creature within 60 feet. On a hit it takes the poison damage and is poisoned until the end of your next turn.',
    roll: '2d8',
    level: 1,
    category: 'weapon',
    toHit: '1d20+INT+PROF',
  },
  {
    key: 'remove-curse',
    name: 'Remove Curse',
    text: 'Action · Instantaneous. Every curse on one creature or object you touch ends. A cursed magic item keeps its curse but releases its owner\'s attunement, so it can be put down.',
    roll: null,
    level: 3,
    category: 'passive',
  },
  {
    key: 'resistance',
    name: 'Resistance',
    text: 'Action · Concentration, up to 1 minute. Touch a willing creature and name a damage type. Once a turn, when it takes that kind of damage, it reduces the total by the die.',
    roll: '1d4',
    level: 0,
    category: 'action',
  },
  {
    key: 'revivify',
    name: 'Revivify',
    text: 'Action · Instantaneous. Touch a creature that died within the last minute and it returns to life with 1 hit point. It does not regrow anything it lost, and the diamond you spend is gone.',
    roll: null,
    level: 3,
    category: 'passive',
  },
  {
    key: 'rope-trick',
    name: 'Rope Trick',
    text: 'Action · 1 hour. A rope you touch rises on end and opens an invisible portal into a pocket space that holds eight creatures for an hour. Nothing can be attacked through it, and everything inside drops out when it ends.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'sacred-flame',
    name: 'Sacred Flame',
    text: 'Action · Instantaneous. Radiance falls on one creature within 60 feet, which takes the damage unless it succeeds on a Dexterity saving throw. Cover does not help it.',
    roll: '1d8',
    level: 0,
    category: 'action',
  },
  {
    key: 'sanctuary',
    name: 'Sanctuary',
    text: 'Bonus Action · 1 minute. Anything that targets the warded creature within 30 feet must first succeed on a Wisdom saving throw or pick a new target and lose the attack. Areas of effect ignore it, and it ends if the ward attacks or deals damage.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'scorching-ray',
    name: 'Scorching Ray',
    text: 'Action · Instantaneous. Three rays of fire within 120 feet, aimed at one target or split between several, each rolled separately. The damage listed is for a single ray.',
    roll: '2d6',
    level: 2,
    category: 'weapon',
    toHit: '1d20+INT+PROF',
  },
  {
    key: 'searing-smite',
    name: 'Searing Smite',
    text: 'Bonus Action · 1 minute. Taken the instant you land a melee weapon or unarmed strike. The target takes the extra fire damage now, and again at the start of each of its turns until it succeeds on a Constitution saving throw.',
    roll: '1d6',
    level: 1,
    category: 'action',
  },
  {
    key: 'see-invisibility',
    name: 'See Invisibility',
    text: 'Action · 1 hour. For an hour you see invisible creatures and objects as though they were plainly there, and see into the Ethereal Plane, whose occupants look ghostly.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'sending',
    name: 'Sending',
    text: 'Action · Instantaneous. Send a message of twenty-five words to a creature you have met, anywhere at all, and hear its reply at once. Across planes there is a small chance it never arrives, and you know if it fails.',
    roll: null,
    level: 3,
    category: 'passive',
  },
  {
    key: 'shatter',
    name: 'Shatter',
    text: 'Action · Instantaneous. A ringing crack of noise fills a 10-foot radius within 60 feet. Each creature there takes the damage, halved on a successful Constitution saving throw, and a construct saves with disadvantage.',
    roll: '3d8',
    level: 2,
    category: 'action',
  },
  {
    key: 'shield',
    name: 'Shield',
    text: 'Reaction · 1 round. Taken when an attack lands on you or Magic Missile targets you. Your Armour Class rises by 5 until your next turn, including against the triggering attack, and Magic Missile does nothing at all.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'shield-of-faith',
    name: 'Shield of Faith',
    text: 'Bonus Action · Concentration, up to 10 minutes. A shimmering field around a creature within 60 feet gives it a +2 bonus to Armour Class for as long as you concentrate.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'shillelagh',
    name: 'Shillelagh',
    text: 'Bonus Action · 1 minute. A club or quarterstaff in your hand draws on nature. For a minute you swing it with your spellcasting ability instead of Strength, its damage die becomes a d8, and the damage can be force instead of the weapon\'s own type.',
    roll: null,
    level: 0,
    category: 'passive',
  },
  {
    key: 'shining-smite',
    name: 'Shining Smite',
    text: 'Bonus Action · Concentration, up to 1 minute. Taken the instant you land a melee weapon or unarmed strike. The target takes the extra radiant damage, then sheds light, cannot turn invisible, and is attacked with advantage.',
    roll: '2d6',
    level: 2,
    category: 'action',
  },
  {
    key: 'shocking-grasp',
    name: 'Shocking Grasp',
    text: 'Action · Instantaneous. Lightning leaps from your hand to a creature you touch. On a hit it cannot make opportunity attacks until the start of its next turn.',
    roll: '1d8',
    level: 0,
    category: 'weapon',
    toHit: '1d20+INT+PROF',
  },
  {
    key: 'silence',
    name: 'Silence',
    text: 'Action or ritual · Concentration, up to 10 minutes. A 20-foot sphere within 120 feet that no sound can enter or leave. Everything wholly inside is deafened and immune to thunder damage, and no spell with a spoken component can be cast there.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'silent-image',
    name: 'Silent Image',
    text: 'Action · Concentration, up to 10 minutes. A soundless, scentless illusion no bigger than a 15-foot cube within 60 feet, which a Magic action moves and reshapes. Anything touching it passes straight through.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'sleep',
    name: 'Sleep',
    text: 'Action · Concentration, up to 1 minute. Creatures of your choice in a 5-foot radius within 60 feet must succeed on a Wisdom saving throw or be unable to act, then fall unconscious if they fail a second. Damage or a shake wakes them, and elves are immune.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'sleet-storm',
    name: 'Sleet Storm',
    text: 'Action · Concentration, up to 1 minute. Freezing sleet fills a 20-foot cylinder within 150 feet, heavily obscuring it and dousing flames. Anything entering or starting its turn there must succeed on a Dexterity saving throw or slip over and lose concentration.',
    roll: null,
    level: 3,
    category: 'passive',
  },
  {
    key: 'slow',
    name: 'Slow',
    text: 'Action · Concentration, up to 1 minute. Up to six creatures in a 40-foot cube within 120 feet must succeed on a Wisdom saving throw or be dragged out of time: −2 Armour Class and Dexterity saves, no reactions, one action or one bonus action but not both, and only ever one attack.',
    roll: null,
    level: 3,
    category: 'passive',
  },
  {
    key: 'sorcerous-burst',
    name: 'Sorcerous Burst',
    text: 'Action · Instantaneous. Raw sorcery at one creature or object within 120 feet, in whichever of seven damage types you like. Roll the highest number on a damage die and you may roll another, up to your spellcasting modifier\'s worth of extras.',
    roll: '1d8',
    level: 0,
    category: 'weapon',
    toHit: '1d20+CHA+PROF',
  },
  {
    key: 'spare-the-dying',
    name: 'Spare the Dying',
    text: 'Action · Instantaneous. A creature within 15 feet that is at 0 hit points and not yet dead becomes stable.',
    roll: null,
    level: 0,
    category: 'passive',
  },
  {
    key: 'speak-with-animals',
    name: 'Speak with Animals',
    text: 'Action or ritual · 10 minutes. For ten minutes you can talk with beasts and try to sway them. Most have little to say beyond food, danger and whatever has passed nearby in the last day.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'speak-with-dead',
    name: 'Speak with Dead',
    text: 'Action · 10 minutes. A corpse with a mouth answers five questions. It knows only what it knew in life, answers briefly and cryptically, and need not tell the truth if it disliked you.',
    roll: null,
    level: 3,
    category: 'passive',
  },
  {
    key: 'speak-with-plants',
    name: 'Speak with Plants',
    text: 'Action · 10 minutes. Plants within 30 feet gain enough sense to answer you about what has passed nearby in the last day, and to open or close the way through undergrowth for ten minutes.',
    roll: null,
    level: 3,
    category: 'passive',
  },
  {
    key: 'spider-climb',
    name: 'Spider Climb',
    text: 'Action · Concentration, up to 1 hour. A willing creature you touch can walk up walls and across ceilings with its hands free for the hour.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'spike-growth',
    name: 'Spike Growth',
    text: 'Action · Concentration, up to 10 minutes. Thorns and spikes fill a 20-foot radius within 150 feet. Anything crossing takes the damage for every 5 feet it travels, and the ground looks entirely ordinary until somebody makes a Perception check to spot it.',
    roll: '2d4',
    level: 2,
    category: 'action',
  },
  {
    key: 'spirit-guardians',
    name: 'Spirit Guardians',
    text: 'Action · Concentration, up to 10 minutes. Spirits swirl 15 feet around you, angelic or fiendish as suits you. Anything you have not exempted takes the damage on a failed Wisdom saving throw, half on a success, and finds the going hard.',
    roll: '3d8',
    level: 3,
    category: 'action',
  },
  {
    key: 'spiritual-weapon',
    name: 'Spiritual Weapon',
    text: 'Bonus Action · Concentration, up to 1 minute. A floating spectral weapon appears within 60 feet and strikes at once. On each later turn a bonus action moves it 20 feet and strikes again.',
    roll: '1d8+WIS',
    level: 2,
    category: 'weapon',
    toHit: '1d20+WIS+PROF',
  },
  {
    key: 'starry-wisp',
    name: 'Starry Wisp',
    text: 'Action · Instantaneous. A mote of starlight at one creature or object within 60 feet. On a hit it glows until the end of your next turn and cannot be invisible.',
    roll: '1d8',
    level: 0,
    category: 'weapon',
    toHit: '1d20+WIS+PROF',
  },
  {
    key: 'stinking-cloud',
    name: 'Stinking Cloud',
    text: 'Action · Concentration, up to 1 minute. A 20-foot sphere of nauseating yellow gas within 90 feet, heavily obscuring everything in it. Anything starting its turn there must succeed on a Constitution saving throw or be too sick to act that turn.',
    roll: null,
    level: 3,
    category: 'passive',
  },
  {
    key: 'suggestion',
    name: 'Suggestion',
    text: 'Action · Concentration, up to 8 hours. Suggest a reasonable course of action, in twenty-five words or fewer, to one creature within 30 feet that can understand you. On a failed Wisdom saving throw it pursues that course as best it can. Anything obviously harmful breaks the spell.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'thaumaturgy',
    name: 'Thaumaturgy',
    text: 'Action · Up to 1 minute. A minor wonder within 30 feet: your eyes change, your voice booms, flames gutter and flare, a door slams, the ground trembles, or a phantom sound rolls past. Three can be running at once.',
    roll: null,
    level: 0,
    category: 'passive',
  },
  {
    key: 'thunderwave',
    name: 'Thunderwave',
    text: 'Action · Instantaneous. A wave of force bursts out in a 15-foot cube from you with a thunderclap audible 300 feet away. Creatures caught take the damage and are shoved 10 feet away, or take half and hold their ground on a successful Constitution saving throw.',
    roll: '2d8',
    level: 1,
    category: 'action',
  },
  {
    key: 'tiny-hut',
    name: 'Tiny Hut',
    text: '1 minute or ritual · 8 hours. A 10-foot dome springs up around you for eight hours. Whoever was inside when it was cast can come and go; nothing else can pass through, and no spell of 3rd level or lower reaches in.',
    roll: null,
    level: 3,
    category: 'passive',
  },
  {
    key: 'tongues',
    name: 'Tongues',
    text: 'Action · 1 hour. A creature you touch understands every spoken or signed language it meets, and anyone who knows any language at all understands it in return.',
    roll: null,
    level: 3,
    category: 'passive',
  },
  {
    key: 'true-strike',
    name: 'True Strike',
    text: 'Action · Instantaneous. You make one attack with the weapon you cast the spell with, using your spellcasting ability for it instead of Strength or Dexterity, and dealing radiant damage instead of the weapon\'s own type if you prefer.',
    roll: null,
    level: 0,
    category: 'passive',
  },
  {
    key: 'unseen-servant',
    name: 'Unseen Servant',
    text: 'Action or ritual · 1 hour. An invisible, mindless force appears within 60 feet and does simple chores at a bonus action\'s command — fetching, cleaning, serving, lighting fires. It has Armour Class 10 and one hit point, and cannot attack.',
    roll: null,
    level: 1,
    category: 'passive',
  },
  {
    key: 'vampiric-touch',
    name: 'Vampiric Touch',
    text: 'Action · Concentration, up to 1 minute. A shadow-wrapped hand drains one creature within your reach, healing you for half of what it deals. You can strike again as a Magic action on each of your turns.',
    roll: '3d6',
    level: 3,
    category: 'weapon',
    toHit: '1d20+INT+PROF',
  },
  {
    key: 'vicious-mockery',
    name: 'Vicious Mockery',
    text: 'Action · Instantaneous. A string of enchanted insults at one creature within 60 feet that can hear you. On a failed Wisdom saving throw it takes the psychic damage and its next attack roll has disadvantage.',
    roll: '1d6',
    level: 0,
    category: 'action',
  },
  {
    key: 'warding-bond',
    name: 'Warding Bond',
    text: 'Action · 1 hour. A willing creature you touch gains +1 Armour Class, +1 to saving throws and resistance to all damage while it stays within 60 feet of you — and you take every point of damage it takes.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'water-breathing',
    name: 'Water Breathing',
    text: 'Action or ritual · 24 hours. Up to ten willing creatures within 30 feet can breathe underwater for a day, without losing the way they normally breathe.',
    roll: null,
    level: 3,
    category: 'passive',
  },
  {
    key: 'water-walk',
    name: 'Water Walk',
    text: 'Action or ritual · 1 hour. Up to ten willing creatures within 30 feet can cross water, mud, snow, quicksand or lava as though it were solid ground — though lava is still hot. A bonus action lets one drop through the surface.',
    roll: null,
    level: 3,
    category: 'passive',
  },
  {
    key: 'web',
    name: 'Web',
    text: 'Action · Concentration, up to 1 hour. Sticky strands fill a 20-foot cube within 60 feet. Anything entering or starting its turn there must succeed on a Dexterity saving throw or be held fast until it tears free with a Strength check. Fire burns the strands away for 2d4.',
    roll: null,
    level: 2,
    category: 'passive',
  },
  {
    key: 'wind-wall',
    name: 'Wind Wall',
    text: 'Action · Concentration, up to 1 minute. A wall of roaring wind up to 50 feet long and 15 feet high rises within 120 feet. Creatures in its path take the damage, halved on a successful Strength saving throw, and arrows and small flying things cannot cross it.',
    roll: '4d8',
    level: 3,
    category: 'action',
  },
  {
    key: 'zone-of-truth',
    name: 'Zone of Truth',
    text: 'Action · 10 minutes. A 15-foot sphere within 60 feet in which no creature that fails a Charisma saving throw can knowingly lie. You know who saved, and anyone affected can still be evasive.',
    roll: null,
    level: 2,
    category: 'passive',
  },
]

/**
 * The feats: the ten of the SRD's that a character of level 1–5 can reach — four
 * Origin, four Fighting Style, two General. Epic Boons need level 19 and are out of
 * scope, which is why there are ten rather than eighteen.
 *
 * `level` is null throughout — it means *spell* level, and a feat has none.
 *
 * ⭐ **This list shrank from sixteen to ten by SPLITTING, not by deleting, and that is
 * the most useful thing to know about it.** Eight of the sixteen were never feats at
 * all: Second Wind, Action Surge, Rage, Sneak Attack, Divine Smite, Lay on Hands,
 * Bardic Inspiration and Wild Shape are **class features**, which is a different thing
 * with a different home — they belong on the library sheet for the level that grants
 * them, where a per-level sheet can state the exact number of uses, and where a
 * character who has not taken that class cannot pick them out of a list. The remaining
 * six — Great Weapon Master, Sharpshooter, Tough, Lucky, Mobile and Resilient — are
 * genuine feats that appear in **no** SRD, 2014 or 2024, and were written from general
 * knowledge; they go for the same reason the eight non-SRD archetypes go.
 *
 * ⚠️ **Fourteen keys therefore left this file in one commit and no migration was
 * needed, which is a design paying out rather than luck.** A sheet holds a *copy*
 * (ADR 0005), so every character already carrying Rage still has Rage, with its text,
 * its category and its dice exactly as they were; all that changes is that the picker
 * stops offering it and `catalogueEntry` answers `undefined` for the badge. That is the
 * contract stated at the top of this file, and this is the first time anything has
 * relied on it at scale.
 *
 * ⚠️ **`divine-smite` did not retire — it MOVED**, from this list to `SPELLS`, because
 * 2024 makes Divine Smite a level 1 Paladin spell. The key is the same one, so a
 * character holding the old feat copy keeps a working badge that now points at a spell.
 * Nothing joins on the key, so nothing breaks; it is worth knowing before somebody
 * reads the retirement list and wonders why that key is still resolvable.
 *
 * **Every one of the ten is a `passive`, and none of them rolls anything.** That is not
 * a simplification: an SRD feat in range grants a proficiency, a bonus to a number
 * already on the sheet, or permission to do something, and not one of them has dice of
 * its own. The five rolling entries this list used to have were all class features, and
 * they left with the rest. So there is **no feat with a to-hit and no feat with a roll**
 * — if a future feat has either, it will be the first, and it needs a reason.
 */
export const FEATS: readonly CatalogueEntry[] = [
  {
    key: 'alert',
    name: 'Alert',
    text: 'Origin feat. You add your proficiency bonus to initiative, and once the order is rolled you may swap your place in it with a willing ally\'s — neither of you being incapacitated at the time.',
    roll: null,
    level: null,
    category: 'passive',
  },
  {
    key: 'magic-initiate',
    name: 'Magic Initiate',
    text: 'Origin feat. Two cantrips and one 1st-level spell from the Cleric, Druid or Wizard list, cast with an ability you choose when you take this. The 1st-level spell can be cast once a day without a slot, or with any slot you have. Swap one of the three whenever you gain a level.',
    roll: null,
    level: null,
    category: 'passive',
  },
  {
    key: 'savage-attacker',
    name: 'Savage Attacker',
    text: 'Origin feat. Once a turn, when you hit with a weapon, reroll the damage dice and keep whichever total you prefer.',
    roll: null,
    level: null,
    category: 'passive',
  },
  {
    key: 'skilled',
    name: 'Skilled',
    text: 'Origin feat. You gain proficiency in any three skills or tools of your choice. It can be taken more than once.',
    roll: null,
    level: null,
    category: 'passive',
  },
  {
    key: 'archery',
    name: 'Archery',
    text: 'Fighting Style feat. A +2 bonus to the attack rolls you make with ranged weapons.',
    roll: null,
    level: null,
    category: 'passive',
  },
  {
    key: 'defense',
    name: 'Defense',
    text: 'Fighting Style feat. A +1 bonus to Armour Class while you are wearing light, medium or heavy armour.',
    roll: null,
    level: null,
    category: 'passive',
  },
  {
    key: 'great-weapon-fighting',
    name: 'Great Weapon Fighting',
    text: 'Fighting Style feat. When you roll damage for a melee weapon held in two hands, treat any 1 or 2 on a damage die as a 3. The weapon has to be two-handed or versatile.',
    roll: null,
    level: null,
    category: 'passive',
  },
  {
    key: 'two-weapon-fighting',
    name: 'Two-Weapon Fighting',
    text: 'Fighting Style feat. When a light weapon earns you an extra attack, you add your ability modifier to that attack\'s damage as well — which you would not otherwise do.',
    roll: null,
    level: null,
    category: 'passive',
  },
  {
    key: 'ability-score-improvement',
    name: 'Ability Score Improvement',
    text: 'General feat, from level 4. Raise one ability score by 2, or two of them by 1 each, to a maximum of 20. It can be taken again every time you are offered a feat.',
    roll: null,
    level: null,
    category: 'passive',
  },
  {
    key: 'grappler',
    name: 'Grappler',
    text: 'General feat, from level 4. Raise Strength or Dexterity by 1, to a maximum of 20. Once a turn your unarmed strike can seize a creature as well as hurt it, and you attack anything you have hold of with advantage.',
    roll: null,
    level: null,
    category: 'passive',
  },
]

/**
 * Presets for the things a DM drops onto a goblin, an ogre or a wolf.
 *
 * These carry flat numbers — `1d6+2`, not `1d6+STR` — and the asymmetry with the
 * spell list above is deliberate rather than an oversight. An ability token is a
 * promise that something can resolve it, and the reduced NPC sheet has no ability
 * scores to resolve it against: a monster in this application is a name, an AC, hit
 * points and a list of things it does. So a monster's numbers have to be written into
 * the entry, and the DM edits them on the copy to make a stronger or weaker version of
 * the same creature. The numbers chosen are around CR 1 — a goblin's sword, an
 * ogre's club — because scaling up from a modest starting point is easier than
 * remembering to scale down. The same reasoning now reaches the to-hit, which is why
 * a monster's is written `1d20+4` where a hero's is `1d20+STR+PROF`: there is no
 * Strength score and no level on the sheet for either token to resolve against.
 *
 * The three saving throws exist for the same reason. Without ability scores there is
 * nothing on a monster's sheet for "the ogre makes a Constitution save" to be built
 * from, so the escape hatch is an entry that simply *is* that roll, with the bonus
 * written in and meant to be edited. Only the three commonly called for are here;
 * anything rarer is a custom entry, which costs the DM one line of typing. They are
 * `action`s and their `1d20+2` stays in `roll`: a save is the roll, not an attack that
 * lands one, which is the same reasoning that keeps a d20 in `roll` from making
 * something a weapon.
 */
export const NPC_ACTIONS: readonly CatalogueEntry[] = [
  {
    key: 'npc-claw',
    name: 'Claw',
    text: 'Melee attack, reach 5 feet, slashing damage. The workhorse attack for a beast or anything that fights with its hands.',
    roll: '1d6+2',
    level: null,
    category: 'weapon',
    toHit: '1d20+4',
  },
  {
    key: 'npc-bite',
    name: 'Bite',
    text: 'Melee attack, reach 5 feet, piercing damage. Pack hunters get advantage when one of their own is already beside the target.',
    roll: '1d8+2',
    level: null,
    category: 'weapon',
    toHit: '1d20+4',
  },
  {
    key: 'npc-slam',
    name: 'Slam',
    text: 'Melee attack, reach 5 feet, bludgeoning damage — a construct, an ooze, or anything that swings its whole body at you.',
    roll: '2d6+3',
    level: null,
    category: 'weapon',
    toHit: '1d20+5',
  },
  {
    key: 'npc-scimitar',
    name: 'Scimitar',
    text: 'Melee attack, reach 5 feet, slashing damage. The standard swing of an armed goblin or a bandit.',
    roll: '1d6+2',
    level: null,
    category: 'weapon',
    toHit: '1d20+4',
  },
  {
    key: 'npc-longbow',
    name: 'Longbow',
    text: 'Ranged attack, piercing damage, out to 150 feet and 600 at long range with disadvantage.',
    roll: '1d8+2',
    level: null,
    category: 'weapon',
    toHit: '1d20+4',
  },
  {
    key: 'npc-greatclub',
    name: 'Greatclub',
    text: 'Melee attack, reach 5 feet, bludgeoning damage — an ogre with a tree trunk, and enough to fell a first-level character outright.',
    roll: '2d8+3',
    level: null,
    category: 'weapon',
    toHit: '1d20+6',
  },
  {
    key: 'npc-javelin',
    name: 'Javelin',
    text: 'Thrown or melee attack, piercing damage, 30 feet and 120 at long range. Gives a melee monster something to do on a turn it cannot close.',
    roll: '1d6+2',
    level: null,
    category: 'weapon',
    toHit: '1d20+4',
  },
  {
    key: 'npc-fire-breath',
    name: 'Fire Breath',
    text: 'A cone of fire the creature can loose once every few rounds. Everything caught takes the damage, halved on a successful Dexterity saving throw. These dice suit a hell hound — add more for anything draconic.',
    roll: '6d6',
    level: null,
    category: 'action',
  },
  {
    key: 'npc-multiattack',
    name: 'Multiattack',
    text: 'The creature takes two of its attacks on its turn instead of one. Roll each of them separately from its other entries.',
    roll: null,
    level: null,
    category: 'passive',
  },
  {
    key: 'npc-constitution-save',
    name: 'Constitution Save',
    text: 'A Constitution saving throw for a creature whose sheet has no ability scores to build one from. The bonus is a starting point: +2 suits an ordinary brute, +5 something genuinely tough.',
    roll: '1d20+2',
    level: null,
    category: 'action',
  },
  {
    key: 'npc-dexterity-save',
    name: 'Dexterity Save',
    text: 'A Dexterity saving throw for a creature whose sheet has no ability scores to build one from. +2 fits most things; drop it to zero for anything heavy and slow.',
    roll: '1d20+2',
    level: null,
    category: 'action',
  },
  {
    key: 'npc-wisdom-save',
    name: 'Wisdom Save',
    text: 'A Wisdom saving throw for a creature whose sheet has no ability scores to build one from. Beasts and constructs are usually worse at this than the bonus given here.',
    roll: '1d20+1',
    level: null,
    category: 'action',
  },
]

/** Every catalogue entry, for the integrity test and for a single lookup. */
export const CATALOGUE: readonly CatalogueEntry[] = [...SPELLS, ...FEATS, ...NPC_ACTIONS]

const BY_KEY = new Map(CATALOGUE.map((entry) => [entry.key, entry]))

/**
 * Look one up by key. Returns undefined for a key that has been retired — callers
 * must cope, because a character stores a COPY and may name a key that no longer
 * exists.
 */
export function catalogueEntry(key: string): CatalogueEntry | undefined {
  return BY_KEY.get(key)
}
