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
