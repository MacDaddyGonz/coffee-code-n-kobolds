// Shared by the Convex functions and the browser, like lib/codes.ts and lib/grid.ts
// and for the same reason: a limit the two sides each declare for themselves is two
// limits. Deliberately free of Convex and React imports so the upload panel can
// import it through the `@convex/…` alias rather than keeping a copy — if the client
// and the server disagreed here, the browser would either refuse a map the server
// would have taken, or spend a whole upload the server then throws away.

/**
 * The largest map blob the server will accept, checked against the stored file
 * rather than trusted from the client.
 *
 * ADR 0001 accepts a 1 GB storage ceiling on the Convex free plan and names music
 * as the risk, which only holds while maps stay modest — 25 scenes a game at 4 MB
 * is 100 MB, and that is the arithmetic this number exists to keep true. The
 * browser downscales to a 2560 px long edge before uploading and lands well under
 * it, so a blob that arrives over the limit means the downscaler was bypassed or
 * broke, which is exactly the case a client-side cap cannot catch.
 */
export const MAX_SCENE_BYTES = 4 * 1024 * 1024

/**
 * The largest scene *thumbnail* the server will accept — the small derivative the browser
 * makes from the map it is about to upload, for the DM's scene picker.
 *
 * ⚠️ **A number of its own rather than `MAX_SCENE_BYTES` reused, and `MAX_TOKEN_BYTES`
 * below already wrote the reason down**: a limit sixteen times what the thing can
 * legitimately weigh is nominally a check while allowing a sixteenfold overrun. A 320 px
 * WebP at quality 0.7 (`THUMB_MAX_EDGE` and `THUMB_QUALITY` in `src/lib/images.ts`) is
 * fifteen to forty kilobytes for a real battle map, so 256 KB is nearly an order of
 * magnitude of headroom and still a sixteenth of a map.
 *
 * ⚠️ **Deliberately *not* derived the way `MAX_TOKEN_BYTES` is — twice the uncompressed
 * bitmap — and the difference says something true about this blob.** That rule exists
 * because token art is a file *the DM chose* and the server is defending against whatever
 * came out of an unknown encoder. A thumbnail is produced by this application, from a blob
 * this application already accepted, by a function two files away; twice the RGBA worst
 * case would be 800 KB and would be defending against nothing. The check is still here
 * because invariant 6 is about what is in storage rather than about who wrote it, and a
 * client bug that posted the *map* into this argument is exactly the case it catches.
 *
 * The arithmetic the other four limits are tuned to survives untouched: 25 thumbnails a
 * game at this ceiling is 6.4 MB, against 100 MB of maps.
 */
export const MAX_THUMB_BYTES = 256 * 1024

/**
 * The largest token-art blob the server will accept, checked the same way and for
 * the same reason — `board.addToken` reads the stored file rather than believing
 * the client about it.
 *
 * Half a megabyte, and the number comes from the geometry rather than from taste.
 * The browser downscales token art to a 256 px long edge (`TOKEN_MAX_EDGE` in
 * `src/lib/images.ts`), and an *uncompressed* 256×256 RGBA bitmap is 256 KB — so
 * this is twice the worst case a correctly downscaled token can possibly be, and
 * any real PNG or WebP of that size lands an order of magnitude under it. It also
 * keeps the same arithmetic true as the scene limit: 200 tokens a game at this
 * ceiling is 100 MB, exactly as 25 scenes at MAX_SCENE_BYTES is.
 *
 * A blob arriving over it therefore means the downscaler was bypassed or broke,
 * which is precisely the case a client-side cap cannot catch. Reusing
 * MAX_SCENE_BYTES for tokens would nominally be a check while allowing an eightfold
 * overrun of what a token can legitimately weigh.
 */
export const MAX_TOKEN_BYTES = 512 * 1024

/**
 * The largest handout blob the server will accept, checked against the stored file like
 * the two above.
 *
 * Two megabytes at a 1920 px long edge, which is a full-screen illustration on the
 * desktop browsers this project targets and nothing more — a handout is looked at, not
 * zoomed into, so it does not need a map's 2560. It keeps the same arithmetic the other
 * two are tuned to: 25 handouts a game at this ceiling is 50 MB, against 25 scenes at
 * MAX_SCENE_BYTES being 100 MB and 200 tokens at MAX_TOKEN_BYTES being another 100.
 */
export const MAX_MODAL_BYTES = 2 * 1024 * 1024

/**
 * The largest music blob the server will accept.
 *
 * ⚠️ **This is the first upload limit in the application that is genuinely the only
 * defence, and the difference from the three above is worth stating rather than
 * inheriting.** An image gets three: the browser downscales it, the browser checks the
 * result, and the server checks the stored blob. There is no lossless-enough transcode a
 * browser can do to an audio file, so the first of those does not exist here — the client
 * contributes a size *check* and nothing else, and it saves the DM only the upload rather
 * than saving them the refusal. `blob.size > MAX_MUSIC_BYTES` on the server is the whole
 * of the enforcement.
 *
 * That sharpens invariant 6 rather than weakening it. The invariant was always that a
 * limit only the client applies is a limit a client bug removes; audio is the case where
 * the client was never applying one in the first place, so nothing is being trusted that
 * previously was not.
 *
 * Ten megabytes is roughly seven minutes at 192 kbps or ten at 128 — an ambient loop for a
 * tavern or a dungeon, which is what background music at this table is. Ten tracks a game
 * keeps the same 100 MB per axis the other limits are built around, and it is worth saying
 * the total out loud: a fully loaded game is about 350 MB across maps, tokens, handouts and
 * music, so three of them fill the 1 GB free tier ADR 0001 accepts. That is the arithmetic
 * `npm run prune-games` exists to keep true.
 *
 * `contentType` is worth refusing on beside this, but honestly labelled: it is the header
 * the browser chose at upload, so it catches a DM who picked the wrong file and nothing
 * else. The byte count is the check.
 */
export const MAX_MUSIC_BYTES = 10 * 1024 * 1024

/**
 * How many coins one press of *duplicate* — or of *add five of these* — may create.
 *
 * Ten, because one press is not one document. Every copy gets its own token, its own
 * character and its own vitals row, plus a placement on the scene it lands on: at ten that
 * is **forty writes in one transaction**, and the copies not sharing a hit-point pool is
 * the entire feature rather than an implementation detail to be economised on. A DM who
 * wants twenty presses the button twice, which costs them a click and costs the transaction
 * nothing.
 *
 * ⚠️ **Why it lives here rather than in lib/games.ts beside `MAX_TOKENS_PER_GAME`, which is
 * where a reader will look for it first.** Every constant in that file bounds a **game** —
 * how many seats, scenes, tokens or fog rectangles one may hold — and this bounds a single
 * **call**. That is not taxonomy, because it has a consequence: this is the first cap a
 * **browser control** has to agree with, since the stepper in the add/duplicate dialog must
 * stop at the number the mutation refuses past. `src/` value-imports this file and never
 * lib/games.ts — that one is the authorisation choke point, and dragging `requireDm` and
 * the games projection into the bundle to read an integer is not a trade worth making — so
 * a constant declared there could not be reached by the control that needs it, and the two
 * sides would each end up declaring their own. The header above already says what that is:
 * a limit the two sides each declare for themselves is two limits.
 *
 * It is the first **row count** in a file of byte ceilings, which is the same rule applied
 * to a different unit rather than a new kind of thing living here.
 */
export const MAX_DUPLICATE_COUNT = 10

/**
 * How many blobs one `files.discard` may throw away.
 *
 * A map upload now stores two blobs — the image and its thumbnail — so the client's catch
 * hands `discard` an array rather than an id, and an array needs a bound. Four, because the
 * largest legitimate call is two and doubling it leaves room for a third derivative without
 * making this a decision again.
 *
 * ⚠️ **The bound is what stops this becoming a sweeper, and that is its first job rather
 * than a side effect.** `discard` is the one mutation in the application that deletes bytes
 * by id, DM-gated and nothing more; unbounded, it is a single call that empties a game's
 * share of the 1 GB ADR 0001 accepts. The array exists so one catch is one round trip, not
 * so a client can hand over a list it assembled.
 *
 * **Its second job is the read cost.** `discard` asks every `…References…` predicate about
 * every id, and each predicate is a bounded read of a whole table — a few hundred documents
 * for `tokens`. That is the price of the choke point in CLAUDE.md invariant 8: only a
 * boolean crosses the module boundary, so five questions about four ids genuinely is twenty
 * reads and cannot be one. At four it is under 1200 documents in the worst case and nothing
 * near a transaction's ceiling; at forty it would be a different function.
 *
 * ⚠️ **It sits in this file rather than in lib/games.ts for `MAX_DUPLICATE_COUNT`'s reason,
 * with one honest difference.** Every constant there bounds a *game* and both of these
 * bound a *call*. Unlike that one, no browser control has to agree with this number — the
 * only caller is `useUpload.commit` and it passes one or two — so the file-header's
 * "shared by the Convex functions and the browser" is not what puts it here. The taxonomy
 * is: `lib/games.ts` is the authorisation choke point that `src/` deliberately never
 * imports, and this is where a bound with no game in it goes.
 */
export const MAX_DISCARD_IDS = 4

/**
 * How many vertices one fog polygon may have.
 *
 * ⚠️ **The roadmap gives no number for this, and the arithmetic is why there has to be
 * one.** `MAX_ROLL_DICE`'s docblock is the model — the constant carries the sum, so the next
 * person to move it can see what they are buying.
 *
 * `visiblePositions` asks `anyShapeCovers` once per placement, so the floor is
 * `MAX_PLACEMENTS_PER_SCENE × MAX_FOG_RECTS_PER_SCENE` = **40,000 bounding-box comparisons
 * per execution**, which is what fog already cost before polygons and is four multiplications
 * of nothing. The box is what keeps it there: `shapeCovers` rejects a shape on its bounds
 * before it visits an edge, so on a map where the DM has outlined separate rooms the ray-cast
 * runs once per token, or not at all.
 *
 * The number bounds the case where that is not true — two hundred polygons stacked over one
 * corner of the map, every box containing the point. Then it is
 * `200 × 200 × MAX_FOG_POLYGON_POINTS` edge visits, and at 32 that is **1.28 million per
 * execution of a query on the drag path**, which is bad and finite. Unbounded, it is whatever
 * the client's last request said, on the one query CLAUDE.md invariant 2 exists to protect.
 *
 * Thirty-two is generous for the intended use by a wide margin: a hand-traced room outline is
 * a dozen clicks, and Roll20's polygon tool in practice is fewer. It is deliberately not
 * higher — a DM who needs a hundred-vertex cave wall wants two polygons, which the shape count
 * has room for.
 *
 * ⚠️ **Three is the floor and it is a grammar rather than a courtesy.** Two points describe a
 * line, `boundsOf` gives it a zero extent in one axis, and `rectCovers` then answers false for
 * every point in the plane — a shape drawn on every screen that hides nothing, which is
 * `normaliseFogRect`'s failure exactly. `requireDrawablePolygon` refuses both ends.
 *
 * ⚠️ **It lives in this file rather than beside the shape count in lib/games.ts, and the
 * difference is which side of the wire has to agree.** Every other fog bound is a fact about a
 * *game* that only the server enforces, and the DM meets it as a refusal they can act on —
 * *cover the map with one bigger rectangle*. This one is a fact about a *gesture*, and a
 * refusal on release costs the DM the whole outline with no way to get it back. So
 * `usePolygonDraw` refuses the thirty-third corner as it is clicked, which means the browser
 * needs the number — and lib/games.ts carries `requireDm`, so `src/` deliberately never
 * imports it. That is `MAX_DISCARD_IDS`' taxonomy above, arrived at from the other direction:
 * the server's copy is still the enforcement, and the client's is still only a courtesy that
 * saves a round trip.
 */
export const MAX_FOG_POLYGON_POINTS = 32
