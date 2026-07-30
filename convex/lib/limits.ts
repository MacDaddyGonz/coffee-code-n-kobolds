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
