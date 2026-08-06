// Every entry key this corpus has ever published and no longer resolves, with the reason.
//
// ⚠️ **THIS FILE EXISTS BECAUSE A `bestiary` STORED SHEET IS A LINK AND NOT A COPY.** A
// character assigned a creature stores nothing but its `entryKey` and its challenge rating;
// the hit points, the armour class, the attacks, the abilities and every label are read back
// out of the corpus on every query. So a key that stops resolving does not degrade a
// creature — it falls into `resolveBestiary`'s first branch and the creature becomes a blank
// NPC sheet, mid-session, in every game that ever named it.
//
// That is a real loss and it is *invisible* at the moment it happens: nothing throws,
// nothing logs, the panel still paints, and the goblin simply has no numbers any more. A
// corpus replacement is exactly the change that causes it wholesale — twenty-four keys at
// once, in this instance — so the list is written down and `bestiary.test.ts` asserts that
// every key the corpus has ever had either **still resolves** or **appears here**. That
// converts a silent data loss into a list somebody signed off.
//
// **The rule for adding to this list is that you are allowed to.** Retiring a creature is a
// legitimate act; retiring one *without noticing* is the thing being prevented. What the
// test refuses is a key that has quietly vanished, not a key that has been deliberately
// retired with a sentence saying why.
//
// **The rule for removing from it is stricter: don't, unless the key is genuinely back.**
// A key that reappears in a content file resolves again, so its line here becomes false and
// the test — which checks both directions — says so.

/** Why a key stopped resolving. Three reasons, and the third is a different kind. */
export type RetirementReason =
  /**
   * The creature is in SRD 5.2.1 and its challenge rating is above 6, which is above
   * everything this application models. `CR_VALUES` stops at 6 and there is no row in
   * `CR_BENCHMARKS` to scale it against, so transcribing it would mean inventing one.
   */
  | 'above-cr-6'
  /**
   * The creature is not in SRD 5.2.1 at all. Every one of these was in the 2014 SRD, or in a
   * later supplement, and did not make the cut for the 2024 document — so there is nothing
   * to transcribe and no numbers to check against.
   */
  | 'not-in-srd'
  /**
   * The creature was **written for this application** and never had an SRD source. These are
   * the ones a maintainer might most want back, and they are also the only ones that *could*
   * come back without the SRD's permission: the numbers were ours. They were dropped because
   * the conversion replaced a hand-written corpus with a transcribed one, and keeping a dozen
   * hand-written enemies beside two hundred and fifty-three transcribed ones would leave the
   * corpus half-checked against a source and half not — which is exactly the confusion
   * `social.ts` states its provenance to avoid.
   */
  | 'authored-and-dropped'

export type RetiredEntry = {
  key: string
  /** The name it published under, so a `bestiary` document in the wild is recognisable. */
  name: string
  reason: RetirementReason
  /** One line. What a maintainer needs to know before deciding to bring it back. */
  note: string
}

/**
 * The twenty-four keys the 2024 conversion retired.
 *
 * ⚠️ **All twenty-four were published**, which is to say a game in progress may hold a
 * character linked to any of them. Nothing here is hypothetical.
 *
 * The other hundred and five keys the pre-conversion corpus had are still live: seventy-five
 * transcribed creatures kept their key through `KEY_ALIASES` in scripts/srd/vocabulary.mjs —
 * `goblin` is the SRD's Goblin Warrior, `thug` is its Tough, `animated-armour` its Animated
 * Armor — and all thirty of `social.ts`' authored NPCs were left exactly as they were.
 */
export const RETIRED_ENTRIES: readonly RetiredEntry[] = [
  // ---------------------------------------------------------------------------
  // In SRD 5.2.1, above CR 6.
  //
  // These four are the least painful to lose and the easiest to reverse: the day this
  // application models a rating above 6, they transcribe like any other stat block.
  // ---------------------------------------------------------------------------
  {
    key: 'assassin',
    name: 'Assassin',
    reason: 'above-cr-6',
    note: 'SRD 5.2.1 rates it CR 8. Comes back with the corpus the day CR_VALUES goes past 6.',
  },
  {
    key: 'hydra',
    name: 'Hydra',
    reason: 'above-cr-6',
    note: 'SRD 5.2.1 rates it CR 8, having been a CR 8 creature in 2014 as well.',
  },
  {
    key: 'young-black-dragon',
    name: 'Young Black Dragon',
    reason: 'above-cr-6',
    note: 'CR 7. Its wyrmling — CR 2 — is in the corpus as black-dragon-wyrmling.',
  },
  {
    key: 'young-green-dragon',
    name: 'Young Green Dragon',
    reason: 'above-cr-6',
    note: 'CR 8. Its wyrmling — CR 2 — is in the corpus as green-dragon-wyrmling.',
  },

  // ---------------------------------------------------------------------------
  // Not in SRD 5.2.1.
  //
  // ⚠️ **Each of these was in the 2014 SRD and is not in the 2024 one**, which is a licensing
  // fact rather than a design judgement: the creature still exists in D&D, and this project
  // simply has no open source for its numbers. Writing one from memory would be inventing a
  // stat block and filing it among two hundred and fifty-three transcribed ones.
  // ---------------------------------------------------------------------------
  {
    key: 'orc',
    name: 'Orc',
    reason: 'not-in-srd',
    note: 'The 2024 SRD publishes Orc as a player species and no orc stat block. The goblinoids in enemies.ts are the nearest thing the corpus now has.',
  },
  {
    key: 'banshee',
    name: 'Banshee',
    reason: 'not-in-srd',
    note: 'No 2024 SRD stat block. Wraith and Specter are the undead in that space now.',
  },
  {
    key: 'cyclops',
    name: 'Cyclops',
    reason: 'not-in-srd',
    note: 'No 2024 SRD stat block. Ettin and Hill Giant cover the same tier.',
  },
  {
    key: 'displacer-beast',
    name: 'Displacer Beast',
    reason: 'not-in-srd',
    note: 'No 2024 SRD stat block. Phase Spider is the nearest blink-and-strike creature in range.',
  },
  {
    key: 'nothic',
    name: 'Nothic',
    reason: 'not-in-srd',
    note: 'No 2024 SRD stat block. Gibbering Mouther is the CR 2 aberration that survived.',
  },
  {
    key: 'peryton',
    name: 'Peryton',
    reason: 'not-in-srd',
    note: 'No 2024 SRD stat block. Griffon and Hippogriff cover the flying monstrosity slot.',
  },
  {
    key: 'thri-kreen',
    name: 'Thri-kreen',
    reason: 'not-in-srd',
    note: 'No 2024 SRD stat block; it is a player species in later 2024 material.',
  },
  {
    key: 'myconid-sovereign',
    name: 'Myconid Sovereign',
    reason: 'not-in-srd',
    note: 'No 2024 SRD stat block. Shrieker Fungus and Violet Fungus are the fungal creatures that remain.',
  },

  // ---------------------------------------------------------------------------
  // Written for this application, and dropped with the hand-written corpus.
  //
  // ⚠️ **These are the ones somebody may actually want back**, because nothing outside this
  // repository decides whether they exist. All twelve were humanoid enemies filling out
  // `enemies.ts` — a Zealot beside a Cultist, a Sellsword beside a Thug — and the SRD's own
  // thirty-one humanoids now fill that tab instead. Bringing one back means re-fitting its
  // numbers to the re-derived benchmark rows, which are not the rows it was written against.
  // ---------------------------------------------------------------------------
  {
    key: 'archer',
    name: 'Archer',
    reason: 'authored-and-dropped',
    note: 'A CR 3 ranged specialist. The SRD has no Archer; Scout and the Warrior line cover ranged humanoids now.',
  },
  {
    key: 'bandit-archer',
    name: 'Bandit Archer',
    reason: 'authored-and-dropped',
    note: 'The bow half of a bandit gang. SRD Bandits carry a Light Crossbow on the one stat block.',
  },
  {
    key: 'hedge-witch',
    name: 'Hedge Witch',
    reason: 'authored-and-dropped',
    note: 'A low-tier caster. Cultist Fanatic and Priest are the SRD casters in that range.',
  },
  {
    key: 'illusionist',
    name: 'Illusionist',
    reason: 'authored-and-dropped',
    note: 'A caster built around misdirection. The SRD Mage is the only arcane humanoid in range.',
  },
  {
    key: 'inquisitor',
    name: 'Inquisitor',
    reason: 'authored-and-dropped',
    note: 'A hunting priest. Priest and Cultist Fanatic are the closest SRD humanoids.',
  },
  {
    key: 'orc-warchief',
    name: 'Orc Warchief',
    reason: 'authored-and-dropped',
    note: 'Retired with orc itself — see above. Bugbear Stalker and Hobgoblin Captain are the goblinoid leaders now.',
  },
  {
    key: 'scale-sorcerer',
    name: 'Scale Sorcerer',
    reason: 'authored-and-dropped',
    note: 'A draconic caster written for this corpus. No SRD equivalent at any rating in range.',
  },
  {
    key: 'sellsword',
    name: 'Sellsword',
    reason: 'authored-and-dropped',
    note: 'A mercenary between Thug and Veteran. Tough, Tough Boss and Warrior Veteran fill that ladder now.',
  },
  {
    key: 'swashbuckler',
    name: 'Swashbuckler',
    reason: 'authored-and-dropped',
    note: 'A duellist. Pirate and Pirate Captain are the SRD humanoids nearest to it.',
  },
  {
    key: 'war-priest',
    name: 'War Priest',
    reason: 'authored-and-dropped',
    note: 'A fighting cleric. The SRD Priest is the one entry covering that ground.',
  },
  {
    key: 'warlord',
    name: 'Warlord',
    reason: 'authored-and-dropped',
    note: 'A commander built to buff a unit. Guard Captain and Bandit Captain are the SRD leaders in range.',
  },
  {
    key: 'zealot',
    name: 'Zealot',
    reason: 'authored-and-dropped',
    note: 'A fanatic between Cultist and Cultist Fanatic. Both of those are in the corpus.',
  },
]

/**
 * The keys as a set, for the one caller that wants membership rather than the reasons.
 *
 * A `ReadonlySet` for the reason `ROLE_BY_KEY` in lib/creatures.ts is a `ReadonlyMap`: this
 * is module state, and a Convex isolate outlives the request that warmed it, so a caller that
 * reached in and added a key would retire a live creature for every later query until the
 * next deploy.
 */
export const RETIRED_KEYS: ReadonlySet<string> = new Set(
  RETIRED_ENTRIES.map((entry) => entry.key),
)
