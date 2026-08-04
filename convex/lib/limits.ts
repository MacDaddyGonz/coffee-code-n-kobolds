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
