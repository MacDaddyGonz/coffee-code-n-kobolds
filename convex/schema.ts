import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

// The shapes this schema shares with the queries that project them and the mutations
// that take them as arguments. Imported rather than re-spelled so the table definition
// and the public payload cannot end up disagreeing about which members exist — see the
// notes beside each field below.
//
// The two from lib/roll.ts are the same arrangement for a document a client never
// projects field by field: a feed row's subject and its result travel whole, so the
// stored shape and the public one are one definition rather than two that agree.
// ⚠️ **The *stored* layer union, which is wider than the one every other module uses.**
// It carries the legacy `dm` spelling of the GM layer across the rename, so a row written
// before it still validates. The public projection, `board.addToken` and `board.setLayer`
// all take the narrow three-member `tokenLayerValidator` from the same file, so nothing
// can create a `dm` row from here forward and nothing can send one to a client. Both this
// import and the fourth member go away once the relabel has run — see `layerOf`.
import { storedTokenLayerValidator } from './lib/layers'
import { fogBaseValidator } from './lib/fogBase'
import { gameStatusValidator } from './lib/games'
// The condition vocabulary. Imported here for the table's validator and nowhere else in
// this file — `markerGuard.test.ts` allows exactly three importers inside `convex/`, and
// this is one of them.
import { tokenMarkerValidator } from './lib/markers'
import { feedSubjectValidator, rollResultValidator } from './lib/roll'
import { storedSheetValidator } from './lib/sheet'

export default defineSchema({
  games: defineTable({
    name: v.string(),
    // Normalised uppercase, 6 characters from CODE_ALPHABET. Unique.
    code: v.string(),
    // Display name of whoever created the game, for the lobby header.
    createdByName: v.string(),
    // BEARER SECRET. Holding this is what makes you the DM. Never returned by a
    // public query — see publicGameValidator in lib/games.ts.
    dmCode: v.string(),
    // The recovery phrase is never stored; only a salted SHA-256 of it.
    dmRecoverySalt: v.string(),
    dmRecoveryHash: v.string(),
    // The board everyone is looking at. Read through `activeSceneId` in lib/games.ts,
    // never directly — fog of war made this field load-bearing for secrecy rather than
    // merely for display, because the fogged-token set is a question about *this* scene
    // and four `?? null`s at four call sites is four places to get it wrong.
    activeSceneId: v.optional(v.id('scenes')),
    // 'lobby' until the DM presses Start, then 'playing' and every client flips to
    // the board. Optional only because adding a required field to a table that
    // already has rows fails the schema push — read it through `gameStatus` in
    // lib/games.ts, never directly, so the default lives in exactly one place.
    status: v.optional(gameStatusValidator),
    // WHEN THE AUDIENCE LAST WIDENED — the server's clock at the moment somebody was
    // let in on something they could not previously hear about: a coin moved off the GM
    // layer, a reserved character released, a fog rectangle erased.
    //
    // It exists so that `predatesReveal` on a feed row can be computed **server-side**,
    // which is the only way that comparison can be made honestly. A feed row can arrive
    // at a client because the audience widened rather than because somebody rolled, and
    // announcing it over the map replays a roll from minutes ago as though it just
    // happened. The obvious fix is an age test in the browser, and it is wrong: it would
    // compare this timestamp against the *client's* clock, so a browser a minute out of
    // step would silently announce nothing for the rest of the session. Both operands
    // have to come from the same clock, and the clock a query may not read is precisely
    // this one — so a *mutation* writes it down and the query subtracts.
    //
    // Coarse on purpose: one stamp per game, not one per token. A genuinely fresh roll
    // made in the second before an unrelated reveal loses its flourish, which is a
    // missing animation rather than a wrong one. A per-token stamp would be exact at the
    // price of a character → timestamp map crossing lib/board.ts's boundary.
    //
    // Optional for the reason every field added to this table is. Read through
    // `gameRevealedAt`, written only through `stampReveal`.
    revealedAt: v.optional(v.number()),
    // The handout the DM is currently holding up to the group, or absent for none.
    //
    // A pointer, so it gets `activeSceneId`'s treatment rather than `status`'s: absent
    // means nothing is open, which the projection spells `?? null` at the one place it
    // reads it. There is no default to centralise in an accessor because there is no
    // value that means "none" other than the absence itself.
    openImageId: v.optional(v.id('modalImages')),
    // The track the DM has put on the table. ⚠️ **A pointer, and deliberately not a
    // transport.** Nothing here says whether it is playing, where the playhead is, or
    // when it started — synced play state is the tools-and-polish milestone, and the
    // absence of those three fields is what stops this becoming half of it. Each client
    // presses play for itself, because a browser will not start audio without a gesture
    // anyway.
    activeTrackId: v.optional(v.id('tracks')),
  }).index('by_code', ['code']),

  // A seat at the table, not a user. Identified within a game by nameKey, so a
  // cleared browser rejoins by retyping the same display name. See ADR 0003.
  players: defineTable({
    gameId: v.id('games'),
    // As typed, whitespace-collapsed.
    displayName: v.string(),
    // normaliseDisplayName + lowercase. The identity key.
    nameKey: v.string(),
    // DISPLAY ONLY — drives a badge in the roster. Never an authorisation
    // check: the DM code is the only thing that authorises anything.
    isDm: v.boolean(),
    // The character this seat has claimed. The pointer runs seat → character
    // and never the reverse, so deleting every seat leaves the characters
    // intact and reclaimable.
    characterId: v.optional(v.id('characters')),
  })
    .index('by_gameId', ['gameId'])
    .index('by_gameId_and_nameKey', ['gameId', 'nameKey'])
    .index('by_characterId', ['characterId']),

  // Characters belong to the game, never to a player identity (ADR 0002).
  //
  // THE SECRET IS IN `sheet.kind`. An NPC's sheet is a spoiler of exactly the same
  // shape as a hero's — a name, an armour class, a list of things it does — so no
  // `returns:` validator can catch a leaked one and the guard has to be structural,
  // the same way the DM layer's is. `lib/characters.ts` is the only module in
  // `convex/` that reads this table, and `leakGuard.test.ts` greps the sources to
  // keep it that way. See invariant 8.
  //
  // Note which half of the problem that is. The *document* is a leaked row and
  // needs the choke point above; an NPC's *hit points* are a leaked field, and are
  // caught mechanically by the discriminated union in `publicVitalsValidator`
  // instead. Milestone 3 has one of each, and they need different tools.
  characters: defineTable({
    gameId: v.id('games'),
    name: v.string(),
    // Optional ONLY because this table has held rows since Milestone 1 and adding a
    // required field to a populated table fails the schema push. Never read
    // directly — go through `resolveSheet` in lib/resolve.ts, so the default that
    // makes a legacy row a player character lives in exactly one place. This is the
    // same treatment `games.status` gets through `gameStatus`, for the same reason.
    //
    // **What is stored here is not what the application reads.** The premade-library
    // milestone added a third member, `preset`, which holds a race, a class, an
    // archetype and a level and nothing else — the stats come out of `lib/library/` at
    // resolution time, so awarding a level is one number changing rather than a sheet
    // being rewritten. `resolveSheet` turns any of them into the ordinary
    // `CharacterSheet` every consumer already expected, which is why adding a whole
    // character-building system changed no read path.
    //
    // The bestiary added a fourth, `bestiary`, which is the same arrangement pointed at
    // the DM's corpus: a creature key, a challenge rating, and an optional override diff.
    // The stats come out of `lib/bestiary/`, scaled to that rating, with the DM's
    // overrides laid on top — three layers, and the order cannot be rearranged. Note what
    // it does **not** hold: no hit points, no armour class, no attack bonus. That absence
    // is what makes CR scaling non-compounding, because there is nowhere on the document
    // for a scaled number to be persisted and read back as a baseline. See
    // `bestiarySheetValidator`.
    //
    // Two of the four members are selections that resolve and two are the finished
    // article, and the union is the only place that distinction is recorded. Which of the
    // four is a **monster** is `isMonsterSheet` in lib/sheet.ts and is asked nowhere else
    // — an allow-list of the publishable kinds, so that a fifth member fails the
    // typecheck rather than quietly reaching every player at the table.
    sheet: v.optional(storedSheetValidator),
    // A character the DM has built for somebody who is not here yet. Reserved means
    // **absent from a player's payload**, not greyed out in it: a disabled row still
    // publishes a name, and the name is the spoiler.
    //
    // Top-level rather than a field inside `sheet`, deliberately. It is not a property
    // of the sheet — putting it in the union would let `updateSheet` change it and make
    // `normaliseStoredSheet` responsible for carrying it — and it is a *second* reason to
    // withhold a row, composed with `maySeeCharacter` at the call site rather than folded
    // into it. Folding it in would make a reserved character one the DM cannot assign,
    // because `characters.assign` calls `requireVisibleCharacter` with `isDm` hard-coded
    // false, and being assignable is the one thing reserving it was for.
    //
    // Optional for the reason every field added to this table is: adding a required one
    // to a populated table fails the schema push. Read through `isReservedCharacter` in
    // lib/characters.ts, never directly.
    reserved: v.optional(v.boolean()),
  }).index('by_gameId', ['gameId']),

  // HOW A CHARACTER IS DOING RIGHT NOW, split from the sheet that says what it is.
  //
  // Invariant 2's usual argument — high-churn writes contending with reads — is
  // real here but weaker than it was for token positions: hit points change a few
  // times a round, not ten times a second. The decisive reason is the shape of the
  // subscription rather than the cost of the write.
  //
  // The board needs a live hit-point feed for every visible token. Were current HP
  // a field on the character document, that feed would have to read whole sheets —
  // which for an NPC is precisely the secret — and would re-run every time somebody
  // edited a spell list. In the other direction, one point of damage would re-push
  // every feat and every spell to everyone watching. Four fields here mean the
  // health-bar subscription is structurally incapable of carrying a sheet, which is
  // the same class of guarantee the tokens/tokenPositions split bought.
  //
  // `maxHp` deliberately stays on the sheet. The band a player sees is computed
  // server-side from current/max, so the maximum never has to leave the server for
  // an NPC — and copying it here would make two documents authoritative for the one
  // number that decides what a player is told, which is the denormalisation ADR
  // 0004 rejected for `layer`. `gameId` is not the same thing: a character never
  // changes game, so that pointer cannot go stale, and it buys one bounded read
  // where the alternative is a lookup per character.
  characterVitals: defineTable({
    gameId: v.id('games'),
    characterId: v.id('characters'),
    currentHp: v.number(),
    // Player characters only, and optional because a monster has none to spend.
    hitDiceRemaining: v.optional(v.number()),
    // Keys of once-per-long-rest abilities that have been spent — a Human's Heroic
    // Inspiration, a Half-Orc's Relentless Endurance. Belongs here for the same
    // reason hit points do: it is what changes during play, not what the character
    // is. A rest clears it; an edit does not touch it.
    //
    // The app never enforces the effect, only remembers whether it has been used,
    // which is the part a table forgets. Optional because most races have nothing to
    // spend and a row for one of them should not carry an empty array.
    spentPerRest: v.optional(v.array(v.string())),
  })
    .index('by_gameId', ['gameId'])
    .index('by_characterId', ['characterId']),

  // One board: a background image plus where its grid is. The background layer of
  // requirements.md — players see it and cannot interact with it.
  scenes: defineTable({
    gameId: v.id('games'),
    name: v.string(),
    imageId: v.id('_storage'),
    // Dimensions of the STORED image, after the upload downscaler has had it. Every
    // scene coordinate and all the grid maths are in this space, so calibration is
    // unaffected by whatever the downscaler decided.
    imageWidth: v.number(),
    imageHeight: v.number(),
    // Pixels per square, in image space. Kept as a float: 2240 / 16 is exactly 140,
    // and rounding it would drift a whole square out by the far edge of the map.
    gridSize: v.number(),
    gridOffsetX: v.number(),
    gridOffsetY: v.number(),
    // Maps that arrive with a grid printed on them do not want ours drawn over it.
    gridVisible: v.boolean(),
    // What is painted around the map, where the image does not reach.
    //
    // ⚠️ **Optional where `gridVisible` beside it is required, and the difference is the
    // table's age rather than the field's importance.** That one shipped *with* this table,
    // so every row could carry it from the first write; this arrives against rows that
    // already exist, and a schema push is not atomic. Read through `backgroundOf` in
    // lib/scenes.ts and nowhere else — the discipline lib/sheet.ts states for every field
    // its own schema could not require.
    backgroundColour: v.optional(v.string()),
    // Lit, and the DM blacks areas out, or dark, and the DM lights areas up.
    //
    // ⚠️ **Optional for `backgroundColour`'s reason, and here the default is load-bearing
    // rather than cosmetic.** Absent means `lit` — read through `fogBaseOf` in lib/scenes.ts
    // and nowhere else — because every scene stored before this field existed had its fog
    // drawn *as darkness*, so defaulting them to dark would black out every map in every
    // game on the push. That is the opposite answer from the one `startsCovered` gives an
    // *unrecognised* base, and lib/fogBase.ts's header explains why the two questions
    // deserve opposite answers.
    fogBase: v.optional(fogBaseValidator),
    // A small derivative of the map, for the DM's scene picker and for nothing else.
    //
    // ⚠️ **THE SECOND BLOB IN THIS SCHEMA TO SHARE A TABLE WITH ANOTHER ONE, AND THAT IS
    // WHY `storageGuard.test.ts` HAD TO BE REWRITTEN TO LAND IT.** That guard used to derive
    // one `…References…` predicate per *table*, so `scenes` already having
    // `sceneReferencesImage` would have let this field arrive with its bytes unprotected by
    // `files.discard` — a green build, a passing suite, and a discard that cheerfully
    // deletes the picture a DM is looking at. It now derives one predicate per **field**,
    // which is what forces `sceneReferencesThumbnail` to exist.
    //
    // Optional for `backgroundColour`'s reason and for a second one it does not have: every
    // scene stored before this field existed has no derivative and never will, because
    // nothing regenerates one server-side. Absent is therefore a permanent state rather than
    // a migration window, and `dmScene` in lib/scenes.ts is the one place it becomes a URL —
    // falling back to the full map, so no client has to know this field exists.
    thumbnailId: v.optional(v.id('_storage')),
    // THE DM'S PREP FOR THIS BOARD, and the field in this table that is genuinely a secret.
    //
    // ⚠️ **`scenes.active` is ungated — every player at the table subscribes to it — so this
    // must never reach `publicSceneValidator`.** `lib/scenes.ts` says *nothing in a scene is
    // a secret, the background image is what every player is looking at*, and that sentence
    // stopped being true here: *the lich is invisible until somebody casts detect magic* is
    // the whole ambush, in a milestone whose subject is what players may know. It rides
    // `dmSceneValidator`, whose one consumer is `scenes.list`, which throws for a non-DM.
    // CLAUDE.md invariant 1, and `scenes.test.ts` scans a real player payload for a
    // distinctive string out of a notes fixture rather than trusting this comment.
    //
    // Optional, and absent is the **one** spelling of "no notes" — a blank patch removes the
    // field rather than storing `''`, so there is one state per meaning. Read through
    // `notesOf` and nowhere else, which is what makes the projection able to promise a
    // string. ADR 0008 settled that convention after `SheetEntry` came to spell none twice.
    notes: v.optional(v.string()),
    // Where this board sits in the DM's list.
    //
    // ⚠️ **Optional, and absent means *last* rather than *first*.** A scene nobody has
    // dragged has no opinion about where it goes, and every scene in every game is in that
    // state until the DM first reorders — so answering 0 would silently invert an untouched
    // list the first time one row got a number. `orderOf` in lib/scenes.ts is the only
    // reader, ties break on `_creationTime`, and `scenes.create` and `scenes.duplicate` both
    // leave it absent deliberately: a new map belongs at the end.
    order: v.optional(v.number()),
  }).index('by_gameId', ['gameId']),

  // STABLE token data — art, name, size, layer, owning character. Low churn: this
  // document is written when the DM adds or renames a token, not when one moves.
  // Position lives in `tokenPositions`, per CLAUDE.md invariant 2.
  //
  // Scoped to the game rather than to one scene, so a recurring villain can stand
  // on several boards. The game-editor milestone grows this into the token library.
  tokens: defineTable({
    gameId: v.id('games'),
    name: v.string(),
    // The three layers requirements.md asks for, bottom to top: `background`, `player`,
    // `gm`. This comment used to say there were two, on the reasoning that the background
    // layer *is* the scene image and no token ever lives on it — which was wrong in the
    // same way the union was, and both were corrected together. A token on `background` is
    // scenery: every client is sent it and no player may move it.
    //
    // ⚠️ **Widening this was the one union in this schema where "additive and safe" was
    // false, and it is worth knowing why.** Sight and interaction gave the same answer
    // while there were two layers, so one two-way test served both — `isDm || layer ===
    // 'player'`. Background separates them: seen by everybody, moved by nobody but the DM.
    // So the widening needed a *second* predicate rather than a wider first one, and every
    // read path in lib/board.ts had to be revisited rather than extended. See
    // `maySeeLayer` and `mayPlayersMove` in lib/layers.ts, which have a `never` arm each.
    //
    // THE SECRET IS HERE. A 'gm' token must never reach a player client, and it has
    // the same shape as a 'player' one — so a `returns:` validator cannot catch a
    // leak of it. Every read goes through lib/board.ts. See invariant 8.
    //
    // The stored union is one member wider than the canonical one while the rename of
    // `dm` → `gm` is in flight; see the import at the top of this file.
    layer: storedTokenLayerValidator,
    // Diameter in grid squares. 1 = one square, 2 = a 2×2 ogre.
    sizeSquares: v.number(),
    // Absent → drawn as a coloured coin with the name's initials, which is enough
    // to play with and skips an upload per NPC.
    imageId: v.optional(v.id('_storage')),
    tint: v.string(),
    // Which character stands on this token, if any. NPC tokens have none, which is
    // also why this is optional rather than a union with null — see the roadmap's
    // open question about NPC sheets; nothing here constrains the answer.
    characterId: v.optional(v.id('characters')),
    // THE SEATS THE DM HAS GRANTED THIS TOKEN TO — the explicit half of control, and
    // only the explicit half. The *effective* set is the grants plus the seat holding
    // the token's character, composed by `effectiveControllersOf` in lib/board.ts, and
    // there is deliberately nowhere here for that derived member to be written down: two
    // documents authoritative for one relation is the denormalisation ADR 0004 rejected
    // for `layer`.
    //
    // Keyed on `players` ids rather than on characters, because granting the party a pet
    // grants it to people and a character is claimed by exactly one seat anyway. Seat ids
    // survive a cleared browser — `players.join` is idempotent on `nameKey` (ADR 0003) —
    // so a grant does not evaporate when somebody's laptop restarts.
    //
    // Zero grants and no claim means the DM alone, which is the correction Milestone 2
    // shipped after the first real session: an unattached token is the DM's.
    //
    // Optional because this table has held rows since tokens existed. Read through
    // `grantedControllersOf`, never directly.
    controllerIds: v.optional(v.array(v.id('players'))),
  })
    .index('by_gameId', ['gameId'])
    .index('by_characterId', ['characterId']),

  // HIGH-CHURN position, in its own table (CLAUDE.md invariant 2). Convex rewrites
  // a whole document on patch, so a throttled drag write rewrites these four fields
  // and nothing else — no contention with reads of art, names or sizes.
  //
  // Keyed per (scene, token): the row's EXISTENCE is what places a token on a
  // board, so each scene remembers its own layout and switching scenes destroys
  // nothing. x and y are image-space pixel floats, token centre — floats rather
  // than cells so an in-flight drag carries continuous motion to the other screens
  // instead of hopping cell to cell. The snap happens once, on settle.
  tokenPositions: defineTable({
    sceneId: v.id('scenes'),
    tokenId: v.id('tokens'),
    x: v.number(),
    y: v.number(),
  })
    .index('by_sceneId', ['sceneId'])
    .index('by_tokenId', ['tokenId'])
    .index('by_sceneId_and_tokenId', ['sceneId', 'tokenId']),

  // CONDITIONS ON A COIN — poisoned, prone, concentrating, and the rest.
  //
  // ⚠️ **Labels, and nothing else.** Nothing in `convex/` reads one: no roll consults a
  // marker, no health band is computed from one, and no drag is refused because of one.
  // That is not an omission to be filled in later — it is the whole design, and
  // `markerGuard.test.ts` is what makes it a promise rather than an intention, by greping
  // for a quoted module specifier and failing if anything outside this file, the choke
  // point and the board's public functions imports the vocabulary.
  //
  // ⚠️ **Their own table rather than a field on `tokens`, and the reason is who writes
  // it.** All six writers of that document are DM-gated, so *what can a player cause to be
  // written to the table that holds `layer`?* answers **nothing**, and that emptiness is
  // worth a table to keep: a marker is the first row a non-DM may cause to exist on the
  // board. The second reason is invariant 2 read from the other side — `board.tokens`
  // resolves a signed storage URL per token, so a marker living on that document would
  // re-mint up to two hundred URLs every time somebody ticked *poisoned*, which is exactly
  // the cost ADR 0004 split the two board queries to avoid.
  //
  // **The row's EXISTENCE means "this coin has conditions"**, the way a placement row's
  // existence means "this coin is on that board". Clearing the last marker deletes the row
  // rather than storing an empty array, so a game with two hundred coins and one poisoned
  // goblin holds one row.
  //
  // ⚠️ **THE SECRET IS HERE, one step removed.** A marker row names a `tokenId`, so a row
  // belonging to a GM-layer coin says that a hidden coin exists — which is the oracle
  // `TOKEN_NOT_FOUND` exists to close — and it is indistinguishable in type from a row
  // about a hero. So this table joins `tokens` and `tokenPositions` under `lib/board.ts`
  // in `leakGuard.test.ts`, and it needed **no new predicate and no fourth reader**:
  // `maySee(token, isDm)` already decides it, in the module that already holds it.
  //
  // `gameId` is carried for `characterVitals`' stated reason verbatim: a token never
  // changes game, so the pointer cannot go stale, and it buys one bounded range read where
  // the alternative is a point lookup per token in the query that paints every board.
  //
  // Every field required with no optionals — `fogRects`' inversion argument applies word
  // for word, because the pressure that makes a field optional in this schema is *rows
  // that already exist*, and this table is new.
  tokenMarkers: defineTable({
    gameId: v.id('games'),
    tokenId: v.id('tokens'),
    // Never empty: the writer deletes the row instead. Normalised to the vocabulary's own
    // order by `normaliseMarkers`, so what is stored is canonical and the browser's
    // optimistic value and the server's are the same string of bytes.
    markers: v.array(tokenMarkerValidator),
  })
    .index('by_gameId', ['gameId'])
    .index('by_tokenId', ['tokenId']),

  // FOG OF WAR — the shapes the DM has blacked out on one scene.
  //
  // ⚠️ **THE TABLE NAME IS NOW A MISNOMER AND IT STAYS.** A row here is a rectangle *or* a
  // polygon, and `fogShapes` is what it would be called if it were being written today.
  // Renaming a Convex table is a widen-migrate-narrow across two deploys — a second table,
  // a copy of every row in every game, a window where both are live and every reader has
  // to consult both, then a narrow — and the whole of what it buys is a better word. The
  // schema pushes in this project that were worth that are the ones where the old shape
  // could publish a secret; a table whose every row goes to every client verbatim has no
  // such argument behind it. So the name is history and this comment is the correction.
  //
  // ⚠️ **These rows are not the secret, and that is the unusual thing about this table.**
  // Every rectangle is sent to every client verbatim, because a blacked-out map is the
  // whole user interface — a player has to be able to see that a corridor is dark. What is
  // secret is what happens to be *standing* in one, and that is decided in lib/board.ts by
  // crossing these rows against `tokenPositions`. So this table has no `leakGuard` entry of
  // its own and needs none; the read that turns a rectangle into a withheld token id is a
  // `tokenPositions` read, which is already confined.
  //
  // ⚠️ **What would change that:** per-player fog, revealed-as-you-walk, or line of sight.
  // Any of those makes a rectangle a statement about what *one caller* may know, at which
  // point these rows become secrets of the same shape as non-secrets and this table needs a
  // reader and a predicate like every other table in this file. Today it is symmetric, and
  // the guard would be one that cannot fail.
  //
  // Keyed on the scene alone, with no `gameId`, exactly as `tokenPositions` is: a scene
  // belongs to one game, and every reader already holds a scene that the caller's game has
  // vouched for through `findSceneInGame`.
  //
  // ⚠️ **`points` is the one optional field, and it is optional for this schema's usual
  // reason — rows that already exist.** Every row written before polygons is a rectangle,
  // and **absence means rectangle** rather than a stored `kind` beside it: CLAUDE.md
  // invariant 9's convention, where an optional field already has a spelling for none and a
  // second one is two states for one meaning. `fog.draw`'s *argument* is a discriminated
  // union, which is a different question — a client says which gesture it made, and a row
  // is asked whether it has a point list.
  fogRects: defineTable({
    sceneId: v.id('scenes'),
    // Image-space pixel floats, top-left corner plus extent — the same coordinate space
    // `tokenPositions` and every grid number use, so whatever the upload downscaler decided
    // is invisible here too.
    //
    // ⚠️ **Normalised to a non-negative extent on the write path**, by `normaliseFogRect`
    // in lib/fog.ts. A rubber-band drag produces a rectangle in any of four directions, and
    // a stored row with a negative width silently fails every containment test — fog that
    // looks drawn and hides nothing, which is the worst failure this feature has and the
    // one a DM would never think to check for.
    //
    // ⚠️⚠️ **FOR A POLYGON THESE FOUR ARE THE BOUNDING BOX, COMPUTED SERVER-SIDE BY
    // `boundsOf` AND NEVER TAKEN FROM THE CLIENT.** They are still required, still
    // non-negative, and still what every containment test consults first — `shapeCovers`
    // rejects a shape on the box before it visits an edge, which is the whole reason a
    // polygon costs what a rectangle costs on the drag path. A box a client supplied and
    // got wrong is a shape drawn on every screen that hides nothing, which is
    // `normaliseFogRect`'s failure arriving through a second door, so there is no route by
    // which one reaches this table.
    x: v.number(),
    y: v.number(),
    width: v.number(),
    height: v.number(),
    // The polygon's vertices, in the order the DM clicked them. **Winding order is not
    // normalised and must not be**: `polygonCovers` counts crossings rather than turns, so
    // clockwise and anticlockwise are the same region, and a normaliser would be arithmetic
    // nothing reads.
    points: v.optional(v.array(v.object({ x: v.number(), y: v.number() }))),
  }).index('by_sceneId', ['sceneId']),

  // BARRIERS — the lines on one scene that a token may not be dragged through.
  //
  // ⚠️ **A wall stops movement and decides nothing about sight, and the omission is the
  // design rather than a budget.** Roll20's barriers do both; this table does the first
  // half only. Line of sight, per-player fog and reveal-as-you-walk each turn a stored row
  // into *a statement about what one caller may know* — the exact thing that would make
  // these rows secrets of the same shape as non-secrets and give this table a reader, a
  // predicate and a fourth row in CLAUDE.md invariant 8's table. This milestone is
  // specified so that day does not arrive. lib/walls.ts carries the long version.
  //
  // So, like `fogRects` above and unlike everything below it, **these rows are not the
  // secret**. Every wall goes to every client verbatim, because a client that has not been
  // sent the geometry cannot stop a drag against it — and a line traced over the wall the
  // map already has drawn on it leaks nothing the fully-downloaded image does not. The
  // genuine residual is a barrier where the map shows *no* wall, which ADR 0015 records in
  // its costs and the wall panel says out loud.
  //
  // Keyed on the scene alone with no `gameId`, exactly as `fogRects` and `tokenPositions`
  // are: a scene belongs to one game, and every reader already holds a scene the caller's
  // game has vouched for through `findSceneInGame`.
  //
  // ⚠️ **Every field required, with no optionals** — `fogRects`' and `tokenMarkers`'
  // inversion argument for the third time, because the pressure that makes a field optional
  // in this schema is *rows that already exist*, and this table is new. A `points` that
  // could be absent would be a wall that blocks nothing, stored, counted against the cap and
  // invisible on the map.
  walls: defineTable({
    sceneId: v.id('scenes'),
    // The vertices, in the order the DM clicked them, in the same image-space pixels every
    // other coordinate in this application uses. **Two or more**, enforced by `walls.add`
    // rather than by the validator, which cannot express a minimum length.
    //
    // ⚠️ **A polyline and never a polygon: the list is NOT closed.** `pathCrossesAnyWall`
    // walks neighbouring pairs and stops, so a DM who wants a sealed room clicks back onto
    // the corner they started at and that repeated vertex is a real segment. Closing every
    // wall implicitly would draw a barrier across the mouth of every corridor anybody
    // traced. This is the one place a repeated first-and-last point is *meaningful* rather
    // than the redundant corner `usePolygonDraw` drops.
    //
    // Winding order is not normalised, for `fogRects.points`' reason: a segment
    // intersection test has no opinion about direction, so a normaliser would be arithmetic
    // nothing reads.
    points: v.array(v.object({ x: v.number(), y: v.number() })),
  }).index('by_sceneId', ['sceneId']),

  // WHAT HAPPENED, AND WHO MAY HEAR ABOUT IT — the game feed.
  //
  // THE SECRET IS `characterId`. A line reading `Ancient Red Dragon attacks with their
  // Bite` publishes a name the DM has not revealed, and it has precisely the shape of a
  // line about a hero — so no `returns:` validator can tell the two apart, and the guard
  // has to be structural for the third time in this schema. `lib/feed.ts` is the only
  // module in `convex/` allowed to read *or write* this table, and `leakGuard.test.ts`
  // greps the sources to keep it that way (invariant 8).
  //
  // Note that the question it is filtered by is a **new** one rather than the sheet rule
  // reused: `mayHearOf` in lib/characters.ts decides whose name may appear in a line
  // saying they did something, which is not `maySeeCharacter`'s question about whose
  // sheet may be opened. A player watching a goblin's coin may hear that it attacked and
  // still may not read its armour class.
  //
  // ⚠️ **Every field here is required, and "none" is spelled `null` rather than absent —
  // a decision, not an oversight.** Read against the tables above, where nearly every
  // added field carries the opposite comment, that inversion needs saying out loud. The
  // rule those comments record is that a field is optional *because adding a required one
  // to a populated table fails the schema push*; the pressure is the rows that already
  // exist. This table is new and has none, so nothing forces the weaker spelling, and
  // required-with-`null` is one state per meaning instead of two — which is the
  // convention ADR 0008 settled after `SheetEntry` came to spell "none" both ways.
  //
  // It is also why the field-by-field rebuild trap that ADR settled does not bite here:
  // this milestone adds no field to any *populated* table, so there is nothing for
  // `board-smoke.mjs` to report as `present on one side only`.
  feed: defineTable({
    gameId: v.id('games'),
    // THE VISIBILITY KEY, and the only field `lib/feed.ts` filters a row on. Whose line
    // this is, so `mayHearOf` can decide whether this caller may be told it exists.
    //
    // `null` is an **ad-hoc roll** — somebody typed `2d6` into the dice tray. It names
    // nobody, so there is no secret in it and the whole table sees it.
    characterId: v.union(v.id('characters'), v.null()),
    // A BREADCRUMB, NOT A FOREIGN KEY: the character's name as it stood when the roll
    // happened, copied rather than looked up. The same reasoning `catalogueKey` and
    // `FeedSubject`'s `entry` are written with — a feed row is *what happened*, so it is
    // written down, and a rename an hour later must not rewrite history.
    //
    // It is not a second spelling of the secret either. A row this caller may not hear
    // about is dropped whole, so a name here only ever reaches somebody `characterId`
    // has already admitted.
    actorName: v.string(),
    // The facts the sentence is generated from, never the English itself — see the header
    // of lib/roll.ts, which is where that argument lives.
    subject: feedSubjectValidator,
    // What the dice did, or `null` for a line with no dice in it at all: a passive being
    // declared, or an alt-clicked description.
    roll: v.union(rollResultValidator, v.null()),
    // The DM's "just for me". A second, unrelated reason to withhold a row, `&&`-ed with
    // the visibility question in `visibleFeed` rather than folded into it — the same
    // arrangement `isReservedCharacter` keeps beside `maySeeCharacter`.
    dmOnly: v.boolean(),
  })
    .index('by_gameId', ['gameId'])
    // For `deleteFeedForCharacter`, which runs when the DM deletes a character. One line
    // here against a scan of a table that grows all evening, on a delete path — which is
    // the trade this codebase argues against making the other way round.
    .index('by_characterId', ['characterId']),

  // HANDOUTS — the images the DM holds up to the group. `games.openImageId` says which one
  // is on screen right now; these are the ones available to open.
  //
  // Not a secret table, and worth saying so given how much of this schema is. An image
  // reaches a player only when the DM has opened it, and the *list* is DM-only for
  // `scenes.list`'s reason — a row called "The Duke's Real Face" is a spoiler — but that is
  // a gate on one query, not a row-shaped secret needing a choke point. Nothing here has a
  // non-secret twin it could be confused with.
  //
  // The upload-backed *library* with browsing and reuse is the game-editor milestone; this
  // is the pop-up requirements.md asks for, and uploads go straight to use exactly as a map
  // and a token's art have since the board existed.
  modalImages: defineTable({
    gameId: v.id('games'),
    // ONE STRING DOING THREE JOBS, deliberately: the DM's label in the list, the dialog's
    // accessible title (Radix will not render one without it) and the image's alt text. A
    // second player-facing caption beside it would be two strings to keep in step for one
    // purpose, and the reason to publish this one is already settled — `publicSceneValidator`
    // publishes the active board's name to every player on the same argument.
    name: v.string(),
    imageId: v.id('_storage'),
    // Dimensions of the STORED image, as `scenes` keeps them and for the same reason: the
    // viewer sizes itself without waiting for the bytes, so a handout does not reflow the
    // moment it decodes.
    imageWidth: v.number(),
    imageHeight: v.number(),
  }).index('by_gameId', ['gameId']),

  // BACKGROUND MUSIC — the tracks the DM has loaded for this game.
  //
  // ⚠️ **`files.discard` has to know about this table and about `modalImages`**, and that is
  // the one thing to remember when adding either. It refuses to delete a blob a live scene
  // or token still points at, so a fourth and fifth `v.id('_storage')` in this schema means
  // a fourth and fifth predicate there — otherwise a good-citizen discard deletes the bytes
  // out from under a handout somebody is looking at. A test greps this file for
  // `v.id('_storage')` and asserts a matching predicate is imported there, because the real
  // invariant — *every table holding a storage id is asked* — is otherwise invisible.
  tracks: defineTable({
    gameId: v.id('games'),
    name: v.string(),
    // ⚠️ Named `fileId` rather than `imageId`, which is not fussiness: it is the one field
    // in this schema pointing at a blob that is not an image, and the upload path forks on
    // exactly that fact. Audio cannot be downscaled, so the browser's shrink step — the
    // courtesy that makes an oversized map impossible in practice — has no equivalent here
    // and the server's byte check is the whole of the enforcement. See MAX_MUSIC_BYTES.
    fileId: v.id('_storage'),
  }).index('by_gameId', ['gameId']),
})
